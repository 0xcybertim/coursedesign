import {
  hashArtworkBytes,
  referencedArtworkHashes,
  type ArtworkAsset,
  type ArtworkConfiguration,
  type ArtworkResult,
  type ArtworkStorageFailureKind,
  type ProcessedArtwork,
} from "@/domain/artwork";
import {
  referencedLocalDesignWorkspaceArtworkHashes,
  type LocalDesignWorkspace,
} from "@/domain/design";
import {
  referencedConceptArtifactHashes,
  type LocalConceptWorkspace,
} from "@/domain/generation";

export const ARTIFACT_DATABASE_NAME = "course-design.artwork.v1" as const;
export const ARTIFACT_DATABASE_VERSION = 1;
export const ARTIFACT_BLOB_STORE = "blobs" as const;
export const ARTIFACT_RECORD_STORE = "artifactRecords" as const;
export const ARTIFACT_SOFT_LIMIT_BYTES = 100 * 1024 * 1024;

interface StoredBlob {
  readonly contentHash: string;
  readonly byteLength: number;
  readonly blob: Blob;
}

export interface ContentAddressedBlobInput {
  readonly contentHash: string;
  readonly blob: Blob;
}

export interface ArtifactStoreOptions {
  readonly indexedDB?: IDBFactory;
  readonly estimate?: () => Promise<StorageEstimate>;
}

export interface ProtectedWorkspaceArtifactInput {
  readonly designWorkspaces?: readonly LocalDesignWorkspace[];
  readonly conceptWorkspaces?: readonly LocalConceptWorkspace[];
  readonly additionalReferencedHashes?: ReadonlySet<string>;
}

export function protectedWorkspaceArtifactHashes(
  input: ProtectedWorkspaceArtifactInput,
): ReadonlySet<string> {
  return new Set([
    ...(input.additionalReferencedHashes ?? []),
    ...(input.designWorkspaces ?? []).flatMap((workspace) =>
      referencedLocalDesignWorkspaceArtworkHashes(workspace),
    ),
    ...(input.conceptWorkspaces ?? []).flatMap((workspace) =>
      referencedConceptArtifactHashes(workspace),
    ),
  ]);
}

function failure(
  kind: ArtworkStorageFailureKind,
  message: string,
): ArtworkResult<never, ArtworkStorageFailureKind> {
  return { ok: false, error: { kind, message, recoverable: true } };
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("IndexedDB transaction was aborted."),
      );
  });
}

function factory(options?: ArtifactStoreOptions): IDBFactory | null {
  return (
    options?.indexedDB ?? (typeof indexedDB === "undefined" ? null : indexedDB)
  );
}

export async function openArtifactDatabase(
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<IDBDatabase, ArtworkStorageFailureKind>> {
  const idb = factory(options);
  if (!idb) {
    return failure(
      "storage_unavailable",
      "IndexedDB is unavailable. Artwork can be previewed in this tab, but immutable save is blocked.",
    );
  }
  try {
    const request = idb.open(ARTIFACT_DATABASE_NAME, ARTIFACT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARTIFACT_BLOB_STORE)) {
        database.createObjectStore(ARTIFACT_BLOB_STORE, {
          keyPath: "contentHash",
        });
      }
      if (!database.objectStoreNames.contains(ARTIFACT_RECORD_STORE)) {
        database.createObjectStore(ARTIFACT_RECORD_STORE, {
          keyPath: "assetId",
        });
      }
    };
    return { ok: true, value: await requestValue(request) };
  } catch {
    return failure(
      "storage_unavailable",
      "Browser artwork storage could not be opened. Nothing was written.",
    );
  }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Blob read failed."));
    reader.readAsArrayBuffer(blob);
  });
}

async function verifiedBlob(blob: Blob, expectedHash: string) {
  const bytes = await blobBytes(blob);
  return hashArtworkBytes(bytes) === expectedHash;
}

function storageError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  return name === "QuotaExceededError"
    ? failure(
        "quota_exceeded",
        "Browser artwork storage is full. No draft metadata was changed.",
      )
    : failure(
        "transaction_failed",
        "The artwork storage transaction failed. No draft metadata was changed.",
      );
}

async function checkStorageCapacity(
  requested: number,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<null, ArtworkStorageFailureKind>> {
  const estimate =
    options?.estimate ??
    (typeof navigator !== "undefined" && navigator.storage?.estimate
      ? () => navigator.storage.estimate()
      : null);
  if (!estimate) return { ok: true, value: null };
  try {
    const current = await estimate();
    const usage = current.usage ?? 0;
    const quota = current.quota ?? Number.POSITIVE_INFINITY;
    if (usage + requested > quota)
      return failure(
        "quota_exceeded",
        "The browser reports insufficient storage quota for these artifact bytes. Nothing was written.",
      );
    if (usage + requested > ARTIFACT_SOFT_LIMIT_BYTES)
      return failure(
        "storage_capacity_low",
        "This write would exceed the available or 100 MiB prototype artifact limit. Clean up proven-unreferenced content first.",
      );
  } catch {
    // Storage estimates are advisory. The verified IndexedDB transaction remains authoritative.
  }
  return { ok: true, value: null };
}

export async function storeContentAddressedBlob(
  input: ContentAddressedBlobInput,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<string, ArtworkStorageFailureKind>> {
  if (!(await verifiedBlob(input.blob, input.contentHash)))
    return failure(
      "corrupt_hash",
      "Artifact bytes do not match their SHA-256 content hash. Nothing was written.",
    );
  const capacity = await checkStorageCapacity(input.blob.size, options);
  if (!capacity.ok) return capacity;
  const opened = await openArtifactDatabase(options);
  if (!opened.ok) return opened;
  const database = opened.value;
  try {
    const transaction = database.transaction(ARTIFACT_BLOB_STORE, "readwrite");
    transaction.objectStore(ARTIFACT_BLOB_STORE).put({
      contentHash: input.contentHash,
      byteLength: input.blob.size,
      blob: input.blob,
    } satisfies StoredBlob);
    await transactionDone(transaction);
  } catch (error) {
    return storageError(error);
  } finally {
    database.close();
  }
  const verified = await getArtworkBlob(input.contentHash, options);
  return verified.ok ? { ok: true, value: input.contentHash } : verified;
}

export async function storeArtworkArtifact(
  processed: ProcessedArtwork,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<ArtworkAsset, ArtworkStorageFailureKind>> {
  const capacity = await checkStorageCapacity(
    processed.sourceBlob.size + processed.renderedBlob.size,
    options,
  );
  if (!capacity.ok) return capacity;

  if (
    !(await verifiedBlob(
      processed.sourceBlob,
      processed.asset.sourceContentHash,
    )) ||
    !(await verifiedBlob(
      processed.renderedBlob,
      processed.asset.renderContentHash,
    ))
  ) {
    return failure(
      "corrupt_hash",
      "Artwork bytes changed before storage. Nothing was written.",
    );
  }

  const opened = await openArtifactDatabase(options);
  if (!opened.ok) return opened;
  const database = opened.value;
  try {
    const transaction = database.transaction(
      [ARTIFACT_BLOB_STORE, ARTIFACT_RECORD_STORE],
      "readwrite",
    );
    const blobs = transaction.objectStore(ARTIFACT_BLOB_STORE);
    const records = transaction.objectStore(ARTIFACT_RECORD_STORE);
    blobs.put({
      contentHash: processed.asset.sourceContentHash,
      byteLength: processed.sourceBlob.size,
      blob: processed.sourceBlob,
    } satisfies StoredBlob);
    blobs.put({
      contentHash: processed.asset.renderContentHash,
      byteLength: processed.renderedBlob.size,
      blob: processed.renderedBlob,
    } satisfies StoredBlob);
    records.put(processed.asset);
    await transactionDone(transaction);
    const verified = await verifyArtworkAsset(processed.asset.assetId, options);
    return verified.ok ? { ok: true, value: verified.value.asset } : verified;
  } catch (error) {
    return storageError(error);
  } finally {
    database.close();
  }
}

export async function getArtworkBlob(
  contentHash: string,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<Blob, ArtworkStorageFailureKind>> {
  const opened = await openArtifactDatabase(options);
  if (!opened.ok) return opened;
  const database = opened.value;
  try {
    const transaction = database.transaction(ARTIFACT_BLOB_STORE, "readonly");
    const stored = (await requestValue(
      transaction.objectStore(ARTIFACT_BLOB_STORE).get(contentHash),
    )) as StoredBlob | undefined;
    await transactionDone(transaction);
    if (!stored) {
      return failure(
        "missing_blob",
        `Artwork blob ${contentHash.slice(0, 12)} is missing on this device.`,
      );
    }
    if (!(await verifiedBlob(stored.blob, contentHash))) {
      return failure(
        "corrupt_hash",
        `Artwork blob ${contentHash.slice(0, 12)} failed SHA-256 verification.`,
      );
    }
    return { ok: true, value: stored.blob };
  } catch (error) {
    return storageError(error);
  } finally {
    database.close();
  }
}

export async function verifyArtworkAsset(
  assetId: string,
  options?: ArtifactStoreOptions,
): Promise<
  ArtworkResult<
    {
      readonly asset: ArtworkAsset;
      readonly sourceBlob: Blob;
      readonly renderedBlob: Blob;
    },
    ArtworkStorageFailureKind
  >
> {
  const opened = await openArtifactDatabase(options);
  if (!opened.ok) return opened;
  const database = opened.value;
  let asset: ArtworkAsset | undefined;
  try {
    const transaction = database.transaction(ARTIFACT_RECORD_STORE, "readonly");
    asset = (await requestValue(
      transaction.objectStore(ARTIFACT_RECORD_STORE).get(assetId),
    )) as ArtworkAsset | undefined;
    await transactionDone(transaction);
  } catch (error) {
    database.close();
    return storageError(error);
  }
  database.close();
  if (!asset) {
    return failure(
      "missing_record",
      `Artwork record ${assetId} is missing on this device.`,
    );
  }
  const source = await getArtworkBlob(asset.sourceContentHash, options);
  if (!source.ok) return source;
  const rendered = await getArtworkBlob(asset.renderContentHash, options);
  if (!rendered.ok) return rendered;
  return {
    ok: true,
    value: { asset, sourceBlob: source.value, renderedBlob: rendered.value },
  };
}

export async function verifyArtworkConfiguration(
  configuration: ArtworkConfiguration,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<readonly string[], ArtworkStorageFailureKind>> {
  const assetIds = [
    ...new Set([configuration.left.assetId, configuration.right.assetId]),
  ];
  for (const assetId of assetIds) {
    const verified = await verifyArtworkAsset(assetId, options);
    if (!verified.ok) return verified;
  }
  for (const hash of referencedArtworkHashes(configuration)) {
    const verified = await getArtworkBlob(hash, options);
    if (!verified.ok) return verified;
  }
  return { ok: true, value: referencedArtworkHashes(configuration) };
}

export async function cleanupUnreferencedArtwork(
  provenReferencedHashes: ReadonlySet<string>,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<number, ArtworkStorageFailureKind>> {
  const opened = await openArtifactDatabase(options);
  if (!opened.ok) return opened;
  const database = opened.value;
  try {
    const transaction = database.transaction(ARTIFACT_BLOB_STORE, "readwrite");
    const store = transaction.objectStore(ARTIFACT_BLOB_STORE);
    const keys = (await requestValue(store.getAllKeys())) as IDBValidKey[];
    let deleted = 0;
    for (const key of keys) {
      const hash = String(key);
      if (!provenReferencedHashes.has(hash)) {
        store.delete(key);
        deleted += 1;
      }
    }
    await transactionDone(transaction);
    return { ok: true, value: deleted };
  } catch (error) {
    return storageError(error);
  } finally {
    database.close();
  }
}

export async function cleanupUnreferencedWorkspaceArtifacts(
  input: ProtectedWorkspaceArtifactInput,
  options?: ArtifactStoreOptions,
): Promise<ArtworkResult<number, ArtworkStorageFailureKind>> {
  return cleanupUnreferencedArtwork(
    protectedWorkspaceArtifactHashes(input),
    options,
  );
}

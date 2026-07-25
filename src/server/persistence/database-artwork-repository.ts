import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type {
  ArtworkRepository,
  AvailableArtworkRecord,
  CanonicalArtworkUpload,
  CanonicalArtworkUploadInput,
  RenderableArtwork,
} from "@/persistence/artwork-repository";
import type { ValidatedSessionContext } from "@/persistence/identity-service";
import {
  persistenceFailure,
  type PersistenceResult,
} from "@/persistence/result";
import type { ServerPersistenceConfig } from "@/server/config/persistence-config";
import * as schema from "@/server/db/schema";
import {
  ObjectStorageError,
  type PrivateObjectStorage,
  type StoredObjectInspection,
} from "@/server/storage/object-storage";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CRC32C_PATTERN = /^[A-Za-z0-9+/]{6}==$/;

type ArtworkRow = typeof schema.artworkAssets.$inferSelect;

function objectKey(workspaceId: string, contentHash: string): string {
  return `workspaces/${workspaceId}/sha256/${contentHash}`;
}

function availableRecord(
  row: ArtworkRow,
): PersistenceResult<AvailableArtworkRecord> {
  if (
    row.state !== "available" ||
    !HASH_PATTERN.test(row.contentHash) ||
    !CRC32C_PATTERN.test(row.crc32c) ||
    row.detectedMediaType !== "image/png" ||
    row.byteLength < 1 ||
    row.pixelWidth < 1 ||
    row.pixelHeight < 1 ||
    !row.objectGeneration
  ) {
    return persistenceFailure(
      "corrupt_record",
      "The canonical artwork metadata is invalid.",
    );
  }
  return {
    ok: true,
    value: {
      contentHash: row.contentHash,
      crc32c: row.crc32c,
      byteLength: row.byteLength,
      mediaType: "image/png",
      pixelWidth: row.pixelWidth,
      pixelHeight: row.pixelHeight,
      state: "available",
      generation: row.objectGeneration,
    },
  };
}

function storageFailure<T>(error: unknown): PersistenceResult<T> {
  if (error instanceof ObjectStorageError) {
    if (error.kind === "missing" || error.kind === "integrity") {
      return persistenceFailure(
        "asset_unavailable",
        error.kind === "missing"
          ? "The canonical artwork upload is not available yet."
          : "The canonical artwork upload failed integrity verification.",
      );
    }
  }
  return persistenceFailure(
    "temporarily_unavailable",
    "Canonical artwork storage is temporarily unavailable. Try again.",
  );
}

function validInput(
  input: CanonicalArtworkUploadInput,
  limits: ServerPersistenceConfig["artwork"],
): boolean {
  return (
    input.purpose === "canonical_render_derivative" &&
    HASH_PATTERN.test(input.contentHash) &&
    CRC32C_PATTERN.test(input.crc32c) &&
    input.mediaType === "image/png" &&
    Number.isSafeInteger(input.byteLength) &&
    input.byteLength > 0 &&
    input.byteLength <= limits.canonicalMaxBytes &&
    Number.isSafeInteger(input.pixelWidth) &&
    input.pixelWidth > 0 &&
    input.pixelWidth <= limits.canonicalMaxWidthPx &&
    Number.isSafeInteger(input.pixelHeight) &&
    input.pixelHeight > 0 &&
    input.pixelHeight <= limits.canonicalMaxHeightPx
  );
}

function inspectionMatches(
  row: ArtworkRow,
  inspection: StoredObjectInspection,
): boolean {
  return (
    inspection.objectKey === row.objectKey &&
    inspection.contentHash === row.contentHash &&
    inspection.crc32c === row.crc32c &&
    inspection.contentType === row.detectedMediaType &&
    inspection.byteLength === row.byteLength &&
    inspection.pixelWidth === row.pixelWidth &&
    inspection.pixelHeight === row.pixelHeight &&
    inspection.metadata.sha256 === row.contentHash &&
    inspection.metadata["canonical-purpose"] === "render-derivative" &&
    inspection.metadata["byte-length"] === String(row.byteLength) &&
    inspection.metadata["pixel-width"] === String(row.pixelWidth) &&
    inspection.metadata["pixel-height"] === String(row.pixelHeight)
  );
}

export class DatabaseArtworkRepository implements ArtworkRepository {
  private readonly database;
  private readonly now: () => Date;

  constructor(
    pool: Pool,
    private readonly session: ValidatedSessionContext,
    private readonly storage: PrivateObjectStorage,
    private readonly config: Pick<ServerPersistenceConfig, "gcs" | "artwork">,
    options: { readonly now?: () => Date } = {},
  ) {
    this.database = drizzle(pool, { schema });
    this.now = options.now ?? (() => new Date());
  }

  async beginCanonicalUpload(
    input: CanonicalArtworkUploadInput,
  ): Promise<PersistenceResult<CanonicalArtworkUpload>> {
    if (!validInput(input, this.config.artwork)) {
      return persistenceFailure(
        "validation",
        "The canonical artwork upload descriptor is invalid.",
      );
    }
    const expectedObjectKey = objectKey(
      this.session.workspaceId,
      input.contentHash,
    );
    const now = this.now();
    try {
      const existing = await this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .select()
          .from(schema.artworkAssets)
          .where(
            and(
              eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
              eq(schema.artworkAssets.contentHash, input.contentHash),
            ),
          )
          .limit(1)
          .for("update");
        if (row?.state === "available") return row;
        const values = {
          workspaceId: this.session.workspaceId,
          contentHash: input.contentHash,
          crc32c: input.crc32c,
          detectedMediaType: input.mediaType,
          byteLength: input.byteLength,
          pixelWidth: input.pixelWidth,
          pixelHeight: input.pixelHeight,
          bucket: this.config.gcs.bucket,
          objectKey: expectedObjectKey,
          objectGeneration: "",
          state: "pending",
          updatedAt: now,
        } as const;
        if (row) {
          const [updated] = await transaction
            .update(schema.artworkAssets)
            .set(values)
            .where(
              and(
                eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
                eq(schema.artworkAssets.id, row.id),
              ),
            )
            .returning();
          return updated;
        }
        const [inserted] = await transaction
          .insert(schema.artworkAssets)
          .values({ ...values, createdAt: now })
          .returning();
        return inserted;
      });
      if (!existing) {
        return persistenceFailure(
          "temporarily_unavailable",
          "The canonical artwork upload could not be prepared.",
        );
      }
      if (existing.state === "available") {
        const validated = availableRecord(existing);
        if (!validated.ok) return validated;
        return {
          ok: true,
          value: {
            contentHash: validated.value.contentHash,
            state: "already_available",
          },
        };
      }
      const expiresAt = new Date(
        now.getTime() + this.config.artwork.signedUrlTtlSeconds * 1_000,
      );
      const authorization = await this.storage.authorizeUpload({
        objectKey: expectedObjectKey,
        contentType: "image/png",
        crc32c: input.crc32c,
        contentHash: input.contentHash,
        byteLength: input.byteLength,
        pixelWidth: input.pixelWidth,
        pixelHeight: input.pixelHeight,
        expiresAt,
      });
      return {
        ok: true,
        value: {
          contentHash: input.contentHash,
          state: "upload_required",
          url: authorization.url,
          expiresAt: authorization.expiresAt.toISOString(),
          requiredHeaders: authorization.requiredHeaders,
        },
      };
    } catch (error) {
      return storageFailure(error);
    }
  }

  async finalizeCanonicalUpload(
    contentHash: string,
  ): Promise<PersistenceResult<AvailableArtworkRecord>> {
    if (!HASH_PATTERN.test(contentHash)) {
      return persistenceFailure(
        "validation",
        "The canonical artwork hash is invalid.",
      );
    }
    try {
      const [row] = await this.database
        .select()
        .from(schema.artworkAssets)
        .where(
          and(
            eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
            eq(schema.artworkAssets.contentHash, contentHash),
          ),
        )
        .limit(1);
      if (!row) {
        return persistenceFailure(
          "missing_reference",
          "That canonical artwork upload is unknown.",
        );
      }
      if (row.state === "available") return availableRecord(row);
      const inspection = await this.storage.inspect(row.objectKey);
      if (!inspectionMatches(row, inspection)) {
        await this.database
          .update(schema.artworkAssets)
          .set({ state: "failed", updatedAt: this.now() })
          .where(
            and(
              eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
              eq(schema.artworkAssets.id, row.id),
            ),
          );
        return persistenceFailure(
          "asset_unavailable",
          "The canonical artwork upload failed integrity verification.",
        );
      }
      const [updated] = await this.database
        .update(schema.artworkAssets)
        .set({
          objectGeneration: inspection.generation,
          state: "available",
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
            eq(schema.artworkAssets.id, row.id),
          ),
        )
        .returning();
      return updated
        ? availableRecord(updated)
        : persistenceFailure(
            "temporarily_unavailable",
            "The canonical artwork upload could not be finalized.",
          );
    } catch (error) {
      return storageFailure(error);
    }
  }

  async verifyAvailable(
    contentHashes: readonly string[],
  ): Promise<PersistenceResult<readonly AvailableArtworkRecord[]>> {
    const uniqueHashes = [...new Set(contentHashes)];
    if (uniqueHashes.some((hash) => !HASH_PATTERN.test(hash))) {
      return persistenceFailure(
        "validation",
        "A canonical artwork hash is invalid.",
      );
    }
    if (uniqueHashes.length === 0) return { ok: true, value: [] };
    try {
      const rows = await this.database
        .select()
        .from(schema.artworkAssets)
        .where(
          and(
            eq(schema.artworkAssets.workspaceId, this.session.workspaceId),
            eq(schema.artworkAssets.state, "available"),
            inArray(schema.artworkAssets.contentHash, uniqueHashes),
          ),
        );
      if (rows.length !== uniqueHashes.length) {
        return persistenceFailure(
          "asset_unavailable",
          "Required canonical artwork is not available in this workspace.",
        );
      }
      const byHash = new Map(rows.map((row) => [row.contentHash, row]));
      const records: AvailableArtworkRecord[] = [];
      for (const hash of uniqueHashes) {
        const row = byHash.get(hash);
        if (!row) {
          return persistenceFailure(
            "asset_unavailable",
            "Required canonical artwork is not available in this workspace.",
          );
        }
        const validated = availableRecord(row);
        if (!validated.ok) return validated;
        records.push(validated.value);
      }
      return { ok: true, value: records };
    } catch {
      return persistenceFailure(
        "temporarily_unavailable",
        "Canonical artwork lookup is temporarily unavailable.",
      );
    }
  }

  async getRenderable(
    contentHash: string,
  ): Promise<PersistenceResult<RenderableArtwork>> {
    const available = await this.verifyAvailable([contentHash]);
    if (!available.ok) return available;
    const record = available.value[0];
    if (!record) {
      return persistenceFailure(
        "asset_unavailable",
        "Required canonical artwork is not available in this workspace.",
      );
    }
    const expiresAt = new Date(
      this.now().getTime() + this.config.artwork.signedUrlTtlSeconds * 1_000,
    );
    try {
      const authorization = await this.storage.authorizeRead({
        objectKey: objectKey(this.session.workspaceId, contentHash),
        generation: record.generation,
        expiresAt,
      });
      return {
        ok: true,
        value: {
          contentHash,
          url: authorization.url,
          expiresAt: authorization.expiresAt.toISOString(),
        },
      };
    } catch (error) {
      return storageFailure(error);
    }
  }
}

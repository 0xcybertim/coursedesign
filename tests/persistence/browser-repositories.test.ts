import { Blob as NodeBlob } from "node:buffer";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import { COURSE_STORAGE_KEY, placeCourseInstance } from "@/domain/course";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  LOCAL_WORKSPACE_STORAGE_KEY,
  updateLocalDraft,
} from "@/domain/design";
import { hashArtworkBytes } from "@/domain/artwork";
import {
  ARTIFACT_DATABASE_NAME,
  storeContentAddressedBlob,
} from "@/lib/browser/artifact-store";
import {
  BrowserArtworkRepository,
  BrowserCourseRepository,
  BrowserDesignRepository,
} from "@/persistence/browser";
import {
  STARTER_COURSE_ROUTE_KEY,
  STARTER_DESIGN_ROUTE_KEY,
} from "@/persistence";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const T0 = "2026-07-25T09:00:00.000Z";
const T1 = "2026-07-25T09:01:00.000Z";

function expectValue<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected persistence success.");
  return result.value;
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(ARTIFACT_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

describe("browser repository adapters", () => {
  it("preserves the existing design storage keys and immutable domain behavior", async () => {
    const storage = new MemoryStorage();
    let id = 0;
    const repository = new BrowserDesignRepository({
      storage,
      now: () => (id === 0 ? T0 : T1),
      createId: (kind) => `${kind}-${++id}`,
    });

    const initial = expectValue(
      await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY),
    );
    expect(storage.values.has(LOCAL_DESIGN_LIBRARY_STORAGE_KEY)).toBe(true);
    expect(storage.values.has(LOCAL_WORKSPACE_STORAGE_KEY)).toBe(false);

    const changed = expectValue(
      updateLocalDraft(
        {
          schemaVersion: "1.0.0-phase1b",
          designId: "local-spj-04",
          draft: initial.draft,
          revisions: [],
        },
        {
          ...initial.draft.intent,
          frameColor: "red",
          lowerElement: "gate",
        },
        T1,
      ),
    );
    const saved = expectValue(
      await repository.saveDraft({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: initial.lockVersion,
        draft: changed.draft,
      }),
    );
    expect(saved).toMatchObject({
      lockVersion: 2,
      draft: { intent: { frameColor: "red", lowerElement: "gate" } },
    });

    const appended = expectValue(
      await repository.appendStarterRevision({
        routeKey: STARTER_DESIGN_ROUTE_KEY,
        expectedLockVersion: saved.lockVersion,
        idempotencyKey: "browser-idempotency-is-not-persisted",
        referencedRenderableArtworkHashes: [],
      }),
    );
    expect(appended.revision).toMatchObject({
      ordinal: 1,
      snapshot: {
        configuration: { frameColor: "red", lowerElement: "gate" },
      },
    });
    expect(
      expectValue(await repository.listRevisions()).revisions,
    ).toHaveLength(1);
  });

  it("returns an explicit stale-version result without overwriting design data", async () => {
    const storage = new MemoryStorage();
    const repository = new BrowserDesignRepository({
      storage,
      now: () => T0,
      createId: (kind) => `${kind}-stable`,
    });
    const initial = expectValue(
      await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY),
    );

    const stale = await repository.saveDraft({
      routeKey: STARTER_DESIGN_ROUTE_KEY,
      expectedLockVersion: initial.lockVersion + 1,
      draft: initial.draft,
    });
    expect(stale).toMatchObject({
      ok: false,
      error: {
        kind: "stale_version",
        actualLockVersion: initial.lockVersion,
      },
    });
    expect(
      expectValue(await repository.loadDesign(STARTER_DESIGN_ROUTE_KEY)).draft,
    ).toEqual(initial.draft);
  });

  it("preserves the existing course key and applies compare-and-swap", async () => {
    const storage = new MemoryStorage();
    const repository = new BrowserCourseRepository({
      storage,
      now: () => T0,
    });
    const initial = expectValue(
      await repository.loadCourse(STARTER_COURSE_ROUTE_KEY),
    );
    const placed = expectValue(
      placeCourseInstance(initial.draft, {
        instanceId: "instance-1",
        obstacleDesignRevisionId: "revision-1",
        now: T1,
      }),
    );
    const saved = expectValue(
      await repository.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: initial.lockVersion,
        draft: placed,
      }),
    );
    expect(saved.lockVersion).toBe(2);
    expect(storage.values.has(COURSE_STORAGE_KEY)).toBe(true);

    expect(
      await repository.saveCourse({
        routeKey: STARTER_COURSE_ROUTE_KEY,
        expectedLockVersion: initial.lockVersion,
        draft: placed,
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: "stale_version", actualLockVersion: 2 },
    });
  });

  it("reads canonical browser-local artwork without exposing raw source APIs", async () => {
    const bytes = new TextEncoder().encode("canonical-render");
    const contentHash = hashArtworkBytes(bytes);
    expect(
      await storeContentAddressedBlob(
        {
          contentHash,
          blob: new NodeBlob([bytes], {
            type: "image/png",
          }) as unknown as Blob,
        },
        { indexedDB: fakeIndexedDB },
      ),
    ).toEqual({ ok: true, value: contentHash });

    const repository = new BrowserArtworkRepository({
      artifactStore: { indexedDB: fakeIndexedDB },
      createObjectUrl: () => "blob:canonical-render",
    });
    expect(await repository.verifyAvailable([contentHash])).toMatchObject({
      ok: true,
      value: [{ contentHash, state: "available" }],
    });
    expect(await repository.getRenderable(contentHash)).toEqual({
      ok: true,
      value: {
        contentHash,
        url: "blob:canonical-render",
        expiresAt: null,
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  createLocalDesignWorkspace,
  duplicateLocalRevision,
  findLocalRevision,
  LOCAL_WORKSPACE_SCHEMA_VERSION,
  parseLocalDesignWorkspace,
  saveLocalRevision,
  serializeLocalDesignWorkspace,
  updateLocalDraft,
} from "@/domain/design";
import {
  ARTWORK_PROCESSING_VERSION,
  createLinkedArtworkConfiguration,
  type ArtworkAsset,
} from "@/domain/artwork";

const T0 = "2026-07-13T10:00:00.000Z";
const T1 = "2026-07-13T10:01:00.000Z";
const T2 = "2026-07-13T10:02:00.000Z";

function workspace() {
  return createLocalDesignWorkspace({ draftId: "draft-1", now: T0 });
}

function expectSuccess<T>(result: { ok: true; value: T } | { ok: false }) {
  expect(result.ok).toBe(true);
  if (!result.ok)
    throw new Error("Expected a successful local workspace result.");
  return result.value;
}

describe("Phase 1B local design revisions", () => {
  it("creates one versioned mutable draft without invented saved history", () => {
    const value = workspace();
    expect(value.schemaVersion).toBe(LOCAL_WORKSPACE_SCHEMA_VERSION);
    expect(value.draft).toMatchObject({
      draftId: "draft-1",
      draftVersion: 1,
      basedOnRevisionId: null,
      updatedAt: T0,
      intent: { frameColor: "white", lowerElement: "none" },
    });
    expect(value.revisions).toEqual([]);
  });

  it("increments the mutable draft version while leaving history untouched", () => {
    const initial = workspace();
    const revisions = initial.revisions;
    const updated = expectSuccess(
      updateLocalDraft(
        initial,
        { ...initial.draft.intent, frameColor: "red", lowerElement: "gate" },
        T1,
      ),
    );

    expect(updated.draft).toMatchObject({
      draftVersion: 2,
      updatedAt: T1,
      intent: { frameColor: "red", lowerElement: "gate" },
    });
    expect(updated.revisions).toBe(revisions);
  });

  it("rejects unsupported draft choices as typed failures", () => {
    const result = updateLocalDraft(workspace(), { frameColor: "magenta" }, T1);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_draft" },
    });
  });

  it("appends a complete immutable revision snapshot with one pinned hash", () => {
    const initial = workspace();
    const saved = expectSuccess(
      saveLocalRevision(initial, { revisionId: "revision-1", now: T1 }),
    );
    const revision = saved.revisions[0];

    expect(initial.revisions).toEqual([]);
    expect(revision).toMatchObject({
      revisionId: "revision-1",
      ordinal: 1,
      name: "Club Classic · Revision 1",
      configurationHash: revision.snapshot.configurationHash,
    });
    expect(revision.snapshot.billOfMaterials.configurationHash).toBe(
      revision.configurationHash,
    );
    expect(revision.snapshot.renderManifest.configurationHash).toBe(
      revision.configurationHash,
    );
    expect(revision.snapshot.footprint.configurationHash).toBe(
      revision.configurationHash,
    );
    expect(revision.snapshot.productionSpec.configurationHash).toBe(
      revision.configurationHash,
    );
  });

  it("never rewrites an earlier revision when another save is appended", () => {
    const firstSave = expectSuccess(
      saveLocalRevision(workspace(), {
        revisionId: "revision-1",
        now: T1,
      }),
    );
    const firstSnapshot = JSON.stringify(firstSave.revisions[0]);
    const changed = expectSuccess(
      updateLocalDraft(
        firstSave,
        { ...firstSave.draft.intent, frameColor: "blue" },
        T2,
      ),
    );
    const secondSave = expectSuccess(
      saveLocalRevision(changed, {
        revisionId: "revision-2",
        now: T2,
      }),
    );

    expect(JSON.stringify(secondSave.revisions[0])).toBe(firstSnapshot);
    expect(secondSave.revisions[0].configurationHash).not.toBe(
      secondSave.revisions[1].configurationHash,
    );
    expect(firstSave.revisions).toHaveLength(1);
  });

  it("duplicates a saved revision into a new editable identity without changing its source", () => {
    const saved = expectSuccess(
      saveLocalRevision(workspace(), {
        revisionId: "revision-1",
        now: T1,
      }),
    );
    const source = JSON.stringify(saved.revisions[0]);
    const duplicated = expectSuccess(
      duplicateLocalRevision(saved, "revision-1", {
        draftId: "draft-2",
        now: T2,
      }),
    );
    const edited = expectSuccess(
      updateLocalDraft(
        duplicated,
        { ...duplicated.draft.intent, lowerElement: "filler" },
        T2,
      ),
    );

    expect(duplicated.draft).toMatchObject({
      draftId: "draft-2",
      draftVersion: 1,
      basedOnRevisionId: "revision-1",
    });
    expect(edited.draft.intent.lowerElement).toBe("filler");
    expect(JSON.stringify(edited.revisions[0])).toBe(source);
  });

  it("round-trips a valid workspace through browser-safe JSON", () => {
    const saved = expectSuccess(
      saveLocalRevision(workspace(), {
        revisionId: "revision-1",
        now: T1,
      }),
    );
    const restored = expectSuccess(
      parseLocalDesignWorkspace(serializeLocalDesignWorkspace(saved)),
    );
    expect(restored).toEqual(saved);
  });

  it("rejects malformed, unsupported and hash-tampered browser data", () => {
    expect(parseLocalDesignWorkspace("not json")).toMatchObject({
      ok: false,
      error: { kind: "invalid_workspace" },
    });
    expect(
      parseLocalDesignWorkspace(
        JSON.stringify({ schemaVersion: "future", designId: "local-spj-04" }),
      ),
    ).toMatchObject({
      ok: false,
      error: { kind: "unsupported_workspace_schema" },
    });

    const saved = expectSuccess(
      saveLocalRevision(workspace(), {
        revisionId: "revision-1",
        now: T1,
      }),
    );
    const tampered = JSON.parse(serializeLocalDesignWorkspace(saved)) as {
      revisions: { configurationHash: string }[];
    };
    tampered.revisions[0].configurationHash = "tampered";
    expect(parseLocalDesignWorkspace(JSON.stringify(tampered))).toMatchObject({
      ok: false,
      error: { kind: "invalid_revision" },
    });
  });

  it("returns typed failures for missing revisions and duplicate identifiers", () => {
    expect(findLocalRevision(workspace(), "missing")).toMatchObject({
      ok: false,
      error: { kind: "revision_not_found" },
    });
    const saved = expectSuccess(
      saveLocalRevision(workspace(), {
        revisionId: "revision-1",
        now: T1,
      }),
    );
    expect(
      saveLocalRevision(saved, { revisionId: "revision-1", now: T2 }),
    ).toMatchObject({
      ok: false,
      error: { kind: "invalid_revision" },
    });
  });

  it("blocks a custom-artwork revision until every source and render hash is verified", () => {
    const artworkAsset: ArtworkAsset = {
      assetId: "asset-1",
      sourceContentHash: "a".repeat(64),
      renderContentHash: "b".repeat(64),
      originalFilename: "logo.svg",
      detectedMediaType: "image/svg+xml",
      sourceByteLength: 100,
      renderedByteLength: 200,
      pixelWidth: 800,
      pixelHeight: 400,
      hasAlpha: true,
      processingVersion: ARTWORK_PROCESSING_VERSION,
      svgSanitized: true,
      rasterization: "browser_canvas_png",
      createdAt: T1,
      status: "ready",
    };
    const custom = expectSuccess(
      updateLocalDraft(
        workspace(),
        {
          ...workspace().draft.intent,
          artwork: "custom_artwork",
          artworkConfiguration: createLinkedArtworkConfiguration(artworkAsset),
        },
        T1,
      ),
    );
    expect(
      saveLocalRevision(custom, { revisionId: "revision-custom", now: T2 }),
    ).toMatchObject({
      ok: false,
      error: { kind: "artifact_verification_required" },
    });
    const saved = expectSuccess(
      saveLocalRevision(custom, {
        revisionId: "revision-custom",
        now: T2,
        verifiedArtifactHashes: new Set([
          artworkAsset.sourceContentHash,
          artworkAsset.renderContentHash,
        ]),
      }),
    );
    expect(
      saved.revisions[0].snapshot.configuration.artworkConfiguration,
    ).toEqual(createLinkedArtworkConfiguration(artworkAsset));
    const sourceBytes = JSON.stringify(saved.revisions[0]);
    const duplicated = expectSuccess(
      duplicateLocalRevision(saved, "revision-custom", {
        draftId: "draft-custom-copy",
        now: T2,
      }),
    );
    expect(duplicated.draft.intent.artworkConfiguration).toEqual(
      createLinkedArtworkConfiguration(artworkAsset),
    );
    expect(JSON.stringify(duplicated.revisions[0])).toBe(sourceBytes);
    expect(
      parseLocalDesignWorkspace(serializeLocalDesignWorkspace(saved)),
    ).toEqual({ ok: true, value: saved });
  });
});

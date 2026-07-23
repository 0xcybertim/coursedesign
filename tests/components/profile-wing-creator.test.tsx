import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_DESIGN_LIBRARY_STORAGE_KEY,
  parseLocalDesignLibrary,
} from "@/domain/design";
import { hashArtworkBytes } from "@/domain/artwork";
import { ProfileWingCreatorClient } from "@/components/profile-wing/ProfileWingCreatorClient";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  raster: vi.fn(),
  vectorize: vi.fn(),
  store: vi.fn(),
  get: vi.fn(),
  conceptWorkspace: {
    schemaVersion: "1.0.0-phase1g",
    requests: [],
    batches: [],
    concepts: [],
    outcomes: [],
    selectionEvents: [],
    selectedConceptId: null,
    acceptedConceptId: null,
    updatedAt: "2026-07-23T00:00:00.000Z",
  } as Record<string, unknown>,
}));

vi.mock("@/components/profile-wing/profile-wing-source", () => ({
  prepareProfileWingSource: mocks.prepare,
  profileWingBlobBytes: async (blob: Blob) =>
    new Uint8Array(await blob.arrayBuffer()),
  rasterMaskFromCutout: mocks.raster,
}));

vi.mock("@/domain/silhouette", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/silhouette")>();
  return { ...actual, vectorizeSilhouetteMask: mocks.vectorize };
});

vi.mock("@/lib/browser/artifact-store", () => ({
  storeContentAddressedBlob: mocks.store,
  getArtworkBlob: mocks.get,
}));

vi.mock("@/components/concepts/useLocalConceptWorkspace", () => ({
  useLocalConceptWorkspace: () => ({
    workspace: mocks.conceptWorkspace,
    hydrated: true,
  }),
}));

vi.mock("@/components/profile-wing/ProfileWingThreeStage", () => ({
  ProfileWingThreeStage: (props: {
    readonly manifest: { readonly geometrySha256: string };
  }) => (
    <div
      data-testid="mock-profile-stage"
      data-geometry-sha256={props.manifest.geometrySha256}
    />
  ),
}));

const sourceBlob = new Blob(["prepared-source"], { type: "image/jpeg" });
const sourceHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const maskBlob = new Blob(["returned-mask"], { type: "image/png" });
const maskHash = hashArtworkBytes(new TextEncoder().encode("returned-mask"));

describe("Create Profile Wing workflow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.conceptWorkspace = {
      schemaVersion: "1.0.0-phase1g",
      requests: [],
      batches: [],
      concepts: [],
      outcomes: [],
      selectionEvents: [],
      selectedConceptId: null,
      acceptedConceptId: null,
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:profile-wing-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.prepare.mockResolvedValue({
      blob: sourceBlob,
      metadata: {
        sourceId: "upload-aaaaaaaaaaaaaaaaaaaaaaaa",
        sourceKind: "user_upload",
        sourceLabel: "my-dog.png",
        originalFilename: "my-dog.png",
        contentHash: sourceHash,
        mediaType: "image/jpeg",
        byteLength: sourceBlob.size,
        pixelWidth: 1200,
        pixelHeight: 800,
      },
    });
    mocks.store.mockResolvedValue({ ok: true, value: maskHash });
    mocks.get.mockImplementation(async (hash: string) => ({
      ok: true,
      value: hash === sourceHash ? sourceBlob : maskBlob,
    }));
    mocks.raster.mockImplementation(
      async (_blob: Blob, sourceMaskSha256: string) => ({
        width: 480,
        height: 480,
        values: new Uint8Array(480 * 480),
        sourceMaskSha256,
      }),
    );
    mocks.vectorize.mockImplementation(
      (
        input: { readonly sourceMaskSha256: string },
        options?: { readonly prototypeFit?: "auto" },
      ) => ({
        status: "accepted",
        findings: [],
        silhouette: {
          schemaVersion: "1.0.0-phase1h-b1-wing-silhouette",
          coordinateSystem: {
            width: 10000,
            height: 10000,
            origin: "top-left",
            winding: "clockwise-screen-coordinates",
          },
          points: [
            { x: 1000, y: 1000 },
            { x: 9000, y: 1000 },
            { x: 9000, y: 9000 },
            { x: 1000, y: 9000 },
          ],
          polygonSha256:
            "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          sourceMaskSha256: input.sourceMaskSha256,
          vectorizerVersion: "1.0.0-phase1h-b1",
          validatorVersion: "1.0.0-phase1h-b1",
          cleanup: {
            sourceWidth: 480,
            sourceHeight: 480,
            binaryThreshold: 128,
            removedIslandCount: 0,
            removedIslandPixels: 0,
            significantComponentCount: 1,
            retainedForegroundPixels: 80_000,
            retainedForegroundFraction: 0.35,
            enclosedHoleCount: 0,
            maximumCoreRadiusPixels: 80,
          },
          ...(options?.prototypeFit
            ? {
                prototypeFit: {
                  mode: "auto-fit",
                  version:
                    "1.1.0-profile-wing-creator-aspect-preserving-auto-fit",
                  triggerFindingCodes: [
                    "outside_prototype_envelope",
                    "reserved_region_overlap",
                  ],
                  scalePartsPerMillion: 825_000,
                  sourceBounds: {
                    minX: 3000,
                    minY: 0,
                    maxX: 7000,
                    maxY: 10000,
                  },
                  fittedBounds: {
                    minX: 3350,
                    minY: 500,
                    maxX: 6650,
                    maxY: 8750,
                  },
                },
              }
            : {}),
          validationFindings: [],
        },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method)
          return new Response(
            JSON.stringify({
              enabled: true,
              provider: "deterministic-test",
              reason: "enabled",
              automaticRetries: 0,
              externalCallOccursOnlyOnPost: true,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        return new Response(maskBlob, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "x-profile-wing-provider": "deterministic-test",
            "x-profile-wing-adapter-version":
              "1.0.0-profile-wing-deterministic",
            "x-profile-wing-provider-request-id": "none",
          },
        });
      }),
    );
  });

  it("makes no provider call until all confirmations, then accepts, renders, and saves", async () => {
    const user = userEvent.setup();
    render(<ProfileWingCreatorClient forceThreeFailure />);
    await screen.findByText("Local QA provider ready");

    const upload = new File(["source"], "my-dog.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Choose image"), upload);
    expect(await screen.findByText("my-dog.png")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);

    const process = screen.getByRole("button", {
      name: "Run local mask simulation",
    });
    expect(process).toBeDisabled();
    for (const label of [
      "I own this image or have the right to use it.",
      /I understand this derivative is sent to remove.bg/,
      "The image contains no identifiable person.",
      /It contains one clear subject/,
    ])
      await user.click(screen.getByLabelText(label));
    expect(process).toBeEnabled();

    await user.click(process);
    expect(
      await screen.findByText("Deterministic canonical polygon"),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.vectorize).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", {
        name: "Accept & build Profile Wing",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "One polygon. Two faithful views.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("mock-profile-stage")).toHaveAttribute(
      "data-geometry-sha256",
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );

    const save = screen.getByRole("button", {
      name: "Save immutable generated revision",
    });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    expect(screen.getByTestId("profile-creator-status")).toHaveTextContent(
      "Immutable generated-prototype revision saved",
    );
    expect(
      parseLocalDesignLibrary(
        localStorage.getItem(LOCAL_DESIGN_LIBRARY_STORAGE_KEY) ?? "",
      ),
    ).toMatchObject({
      ok: true,
      value: {
        profileWingRevisions: [
          {
            designId: "local-profile-wing-upload-aaaaaaaaaaaaaaaaaaaaaaaa",
            snapshot: {
              provenance: {
                sourceKind: "user_upload",
                sourceLabel: "my-dog.png",
                provider: "deterministic-test",
              },
            },
          },
        ],
      },
    });
  });

  it("can prepare an explicitly accepted Concept Studio result", async () => {
    mocks.conceptWorkspace = {
      schemaVersion: "1.0.0-phase1g",
      requests: [],
      batches: [
        {
          batchId: "batch-accepted-concept",
          provenance: { provider: "deterministic-test" },
        },
      ],
      concepts: [
        {
          conceptId: "concept-accepted-001",
          batchId: "batch-accepted-concept",
          ordinal: 2,
          contentHash: sourceHash,
          mediaType: "image/svg+xml",
        },
      ],
      outcomes: [],
      selectionEvents: [],
      selectedConceptId: "concept-accepted-001",
      acceptedConceptId: "concept-accepted-001",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const user = userEvent.setup();
    render(<ProfileWingCreatorClient forceThreeFailure />);
    await user.click(
      await screen.findByRole("button", {
        name: "Use accepted concept",
      }),
    );
    await waitFor(() =>
      expect(mocks.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceKind: "generated_concept",
          sourceLabel: "Accepted concept 2",
          declaredMediaType: "image/svg+xml",
        }),
      ),
    );
    expect(
      screen.getByText(
        "Accepted concept prepared locally. Nothing has been uploaded.",
      ),
    ).toBeVisible();
  });

  it("auto-fits recoverable placement findings without another provider request", async () => {
    mocks.vectorize.mockImplementationOnce(() => ({
      status: "rejected",
      silhouette: null,
      findings: [
        {
          code: "outside_prototype_envelope",
          message: "The contour extends beyond the prototype envelope.",
        },
        {
          code: "reserved_region_overlap",
          message: "The contour overlaps a reserved attachment region.",
        },
      ],
      cleanup: {
        sourceWidth: 480,
        sourceHeight: 480,
        binaryThreshold: 128,
        removedIslandCount: 0,
        removedIslandPixels: 0,
        significantComponentCount: 1,
        retainedForegroundPixels: 80_000,
        retainedForegroundFraction: 0.35,
        enclosedHoleCount: 0,
        maximumCoreRadiusPixels: 80,
      },
    }));
    const user = userEvent.setup();
    render(<ProfileWingCreatorClient forceThreeFailure />);
    await screen.findByText("Local QA provider ready");

    await user.upload(
      screen.getByLabelText("Choose image"),
      new File(["source"], "tall-crane.png", { type: "image/png" }),
    );
    for (const label of [
      "I own this image or have the right to use it.",
      /I understand this derivative is sent to remove.bg/,
      "The image contains no identifiable person.",
      /It contains one clear subject/,
    ])
      await user.click(screen.getByLabelText(label));
    await user.click(
      screen.getByRole("button", { name: "Run local mask simulation" }),
    );
    expect(await screen.findByText("Placement needs adjustment")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);

    await user.click(
      screen.getByRole("button", {
        name: "Auto-fit silhouette · no new remove.bg call",
      }),
    );
    expect(
      await screen.findByText(/Auto-fit applied · the original remove.bg/),
    ).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.vectorize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceMaskSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      { prototypeFit: "auto" },
    );

    await user.click(
      screen.getByRole("button", { name: "Accept & build Profile Wing" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "One polygon. Two faithful views.",
      }),
    ).toBeVisible();
  });

  it("explains a missing server credential beside the disabled provider action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            enabled: false,
            provider: "remove-bg",
            reason: "provider_credential_missing",
            automaticRetries: 0,
            externalCallOccursOnlyOnPost: true,
          },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<ProfileWingCreatorClient forceThreeFailure />);

    const upload = new File(["source"], "my-dog.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Choose image"), upload);
    for (const label of [
      "I own this image or have the right to use it.",
      /I understand this derivative is sent to remove.bg/,
      "The image contains no identifiable person.",
      /It contains one clear subject/,
    ])
      await user.click(screen.getByLabelText(label));

    expect(
      screen.getByRole("button", { name: "remove.bg setup required" }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(
        "Set REMOVE_BG_API_KEY in the server environment and restart. The key is never sent to the browser.",
      ),
    ).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptStudioClient } from "@/components/concepts/ConceptStudioClient";
import { preparePhotoDerivative } from "@/components/concepts/PhotoInput";
import { hashArtworkBytes } from "@/domain/artwork";
import {
  LOCAL_CONCEPT_WORKSPACE_KEY,
  appendCompletedConceptBatch,
  appendGenerationRequest,
  appendRequestOutcome,
  createEmptyConceptWorkspace,
  createGenerationRequest,
  serializeLocalConceptWorkspace,
  type ConceptConstraints,
} from "@/domain/generation";
import {
  ARTIFACT_DATABASE_NAME,
  storeContentAddressedBlob,
} from "@/lib/browser/artifact-store";

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(globalThis, "indexedDB", {
    value: fakeIndexedDB,
    configurable: true,
  });
  await new Promise<void>((resolve) => {
    const request = fakeIndexedDB.deleteDatabase(ARTIFACT_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => cleanup());

describe("Phase 1G concept studio", () => {
  async function seedOneFixtureBatch() {
    const constraints: ConceptConstraints = {
      family: "profile-wing-vertical-v1",
      silhouetteSubject: "butterfly",
      poleCount: 4,
      colors: "navy and gold",
      lowerElementPreference: "none",
      sponsorArea: "subtle",
      style: "graphic",
    };
    const request = createGenerationRequest({
      requestId: "request-initial",
      kind: "initial",
      prompt: "Butterfly jump",
      constraints,
      createdAt: "2026-07-16T08:00:00.000Z",
    });
    const added = appendGenerationRequest(
      createEmptyConceptWorkspace(),
      request,
    );
    if (!added.ok) throw new Error(added.error.message);
    const concepts = [];
    for (const ordinal of [1, 2, 3, 4] as const) {
      const bytes = new TextEncoder().encode(`fixture-${ordinal}`);
      const contentHash = hashArtworkBytes(bytes);
      const stored = await storeContentAddressedBlob({
        contentHash,
        blob: new NodeBlob([bytes], {
          type: "image/svg+xml",
        }) as unknown as Blob,
      });
      if (!stored.ok) throw new Error(stored.error.message);
      concepts.push({
        conceptId: `concept-${ordinal}`,
        contentHash,
        byteLength: bytes.length,
        mediaType: "image/svg+xml" as const,
      });
    }
    const batched = appendCompletedConceptBatch(added.value, {
      batchId: "batch-1",
      requestId: request.requestId,
      provenance: {
        provider: "deterministic-test",
        configuredModel: "deterministic-concept-v1",
        adapterVersion: "1.0.0-phase1g",
        providerRequestId: "fixture-request-1",
        seed: 1,
        revisedPrompt: null,
      },
      concepts,
      createdAt: "2026-07-16T08:01:00.000Z",
    });
    if (!batched.ok) throw new Error(batched.error.message);
    const completed = appendRequestOutcome(batched.value, {
      outcomeId: "outcome-1",
      requestId: request.requestId,
      status: "completed",
      createdAt: "2026-07-16T08:02:00.000Z",
    });
    if (!completed.ok) throw new Error(completed.error.message);
    localStorage.setItem(
      LOCAL_CONCEPT_WORKSPACE_KEY,
      serializeLocalConceptWorkspace(completed.value),
    );
  }

  it("renders the complete structured workflow and Phase 1H boundary", async () => {
    render(<ConceptStudioClient providerMode="deterministic" />);
    expect(
      screen.getByRole("heading", { name: "Create a jump concept." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Family")).toHaveValue(
      "Profile Wing Vertical",
    );
    expect(screen.getByLabelText("Pole count")).toHaveValue("4 · locked");
    expect(
      screen.getByRole("button", { name: "Create four fixture previews" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create four fixture previews" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Build this concept" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/cannot create or mutate SPJ-04/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Workflow simulator")).toBeInTheDocument();
    expect(
      screen.getByText(
        /does not make live provider calls or demonstrate AI image quality/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Generation brief" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Symmetrical wings with bold edge markings and an upward sweep.",
      ),
    ).toHaveLength(2);
  });

  it("shows and accessibly resolves an obvious subject conflict before submission", async () => {
    render(<ConceptStudioClient providerMode="deterministic" />);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Creative direction — optional"),
      ).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Creative direction — optional"), {
      target: {
        value:
          "Friendly Labrador in side profile, with raised ears and the tail forming the outside edge.",
      },
    });
    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent(
      /mentions dog.*silhouette subject is butterfly/i,
    );
    expect(
      screen.getByLabelText("Creative direction — optional"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByLabelText("Silhouette subject", { exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Create four fixture previews" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Use dog as silhouette subject",
      }),
    );
    expect(
      screen.queryByText("Resolve the subject conflict"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Silhouette subject", { exact: true }),
    ).toHaveValue("dog");
    expect(screen.getAllByText("dog").length).toBeGreaterThan(0);
  });

  it("uses accurate simulator copy separately from live-provider copy", async () => {
    const rendered = render(
      <ConceptStudioClient providerMode="deterministic" />,
    );
    expect(screen.getAllByText("Workflow simulator")).toHaveLength(1);
    expect(screen.getByText(/makes no OpenAI call/i)).toBeInTheDocument();
    rendered.unmount();
    render(<ConceptStudioClient providerMode="openai" />);
    expect(screen.getByText("Live OpenAI Image provider")).toBeInTheDocument();
    expect(
      screen.getByText(
        /sends the assembled brief to OpenAI for real image generation/i,
      ),
    ).toBeInTheDocument();
  });

  it("reveals, scrolls to, and focuses refinement controls after Refine", async () => {
    await seedOneFixtureBatch();
    render(<ConceptStudioClient providerMode="deterministic" />);

    const refineButtons = await screen.findAllByRole("button", {
      name: "Refine",
    });
    await waitFor(() => expect(refineButtons[0]).toBeEnabled());
    fireEvent.click(refineButtons[0]);

    const prompt = await screen.findByLabelText("What should change?");
    expect(
      screen.getByRole("heading", { name: "Describe the change" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/selected fixture stays in history/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(prompt).toHaveFocus());
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("preprocesses orientation-corrected dimensions, re-encodes, hashes, and stores exact derivative bytes", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const derivativeBytes = new TextEncoder().encode("metadata-free-jpeg");
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect,
        drawImage,
      }),
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob([derivativeBytes], { type: "image/jpeg" })),
    } as unknown as HTMLCanvasElement;
    const store = vi.fn(async () => ({ ok: true as const, value: "stored" }));
    const result = await preparePhotoDerivative(
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "oriented.jpg", {
        type: "image/jpeg",
      }),
      "animal",
      {
        decode: async () =>
          ({ width: 4000, height: 2000, close }) as unknown as ImageBitmap,
        createCanvas: () => canvas,
        store,
      },
    );
    expect(result.derivative).toMatchObject({
      pixelWidth: 2048,
      pixelHeight: 1024,
      mediaType: "image/jpeg",
      byteLength: derivativeBytes.length,
      originalFilename: "oriented.jpg",
      subjectKind: "animal",
    });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1024);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 2048, 1024);
    expect(store).toHaveBeenCalledWith({
      contentHash: result.derivative.contentHash,
      blob: result.blob,
    });
    expect(close).toHaveBeenCalled();
  });

  it("returns stable typed failures for unsupported, oversized, and undecodable photos", async () => {
    await expect(
      preparePhotoDerivative(
        new File(["vector"], "subject.svg", { type: "image/svg+xml" }),
        "owned-artwork",
      ),
    ).rejects.toMatchObject({ kind: "unsupported_photo" });
    await expect(
      preparePhotoDerivative(
        new File([], "empty.jpg", { type: "image/jpeg" }),
        "animal",
      ),
    ).rejects.toMatchObject({ kind: "invalid_photo_size" });
    await expect(
      preparePhotoDerivative(
        new File([new Uint8Array([0xff, 0xd8, 0xff])], "broken.jpg", {
          type: "image/jpeg",
        }),
        "animal",
        { decode: async () => Promise.reject(new Error("decode failed")) },
      ),
    ).rejects.toMatchObject({ kind: "photo_decode_failure" });
  });

  it("requires all reference-photo consent checks and links logos to Phase 1F", async () => {
    render(<ConceptStudioClient providerMode="deterministic" />);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Creative direction — optional"),
      ).toBeEnabled(),
    );
    expect(
      screen.getAllByRole("link", {
        name: /exact SPJ-04 artwork workflow/i,
      })[0],
    ).toHaveAttribute("href", "/studio/obstacles/spj-04");
    fireEvent.change(screen.getByLabelText("Creative direction — optional"), {
      target: { value: "A portrait of a person" },
    });
    expect(screen.getByLabelText("Creative direction — optional")).toHaveValue(
      "A portrait of a person",
    );
  });
});

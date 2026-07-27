"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { hashArtworkBytes } from "@/domain/artwork";
import {
  deriveProfileWingPrototypeFromCreation,
  FRAME_COLORS,
  profileWingAppearance,
  type DerivedProfileWingPrototype,
  type ProfileWingDesignRevision,
} from "@/domain/design";
import type { FrameColor } from "@/domain/product/types";
import {
  SILHOUETTE_PROTOTYPE_FIT_VERSION,
  silhouetteFindingsAllowPrototypeFit,
  vectorizeSilhouetteMask,
} from "@/domain/silhouette";
import { useLocalConceptWorkspace } from "@/components/concepts/useLocalConceptWorkspace";
import { useLocalDesignLibrary } from "@/components/design/useLocalDesignLibrary";
import { usePersistenceMode } from "@/components/persistence/PersistenceModeProvider";
import {
  getArtworkBlob,
  storeContentAddressedBlob,
} from "@/lib/browser/artifact-store";
import { ProfileWingThreeStage } from "./ProfileWingThreeStage";
import {
  prepareProfileWingSource,
  profileWingBlobBytes,
  rasterMaskFromCutout,
  type PreparedProfileWingSource,
} from "./profile-wing-source";
import { useLocalProfileWingCreation } from "./useLocalProfileWingCreation";

type ProviderAvailability = {
  readonly enabled: boolean;
  readonly provider: "remove-bg" | "deterministic-test" | null;
  readonly generatedConceptProvider: "deterministic-test" | null;
  readonly reason: string;
  readonly automaticRetries: 0;
  readonly externalCallOccursOnlyOnPost: true;
};

const FRAME_LABELS: Record<FrameColor, string> = {
  white: "White",
  blue: "Blue",
  red: "Red",
  yellow: "Yellow",
};

const DETERMINISTIC_CONCEPT_MASK_ADAPTER_VERSION =
  "1.1.0-profile-wing-deterministic-concept-aware";

function frameColorFromDescription(colors: string | undefined): FrameColor {
  const normalized = colors?.toLowerCase() ?? "";
  const matches = [
    {
      color: "blue" as const,
      index: Math.min(
        ...["blue", "navy"]
          .map((value) => normalized.indexOf(value))
          .filter((index) => index >= 0),
      ),
    },
    { color: "red" as const, index: normalized.indexOf("red") },
    {
      color: "yellow" as const,
      index: Math.min(
        ...["yellow", "gold"]
          .map((value) => normalized.indexOf(value))
          .filter((index) => index >= 0),
      ),
    },
    { color: "white" as const, index: normalized.indexOf("white") },
  ].filter((match) => Number.isFinite(match.index) && match.index >= 0);
  matches.sort((left, right) => left.index - right.index);
  return matches[0]?.color ?? "blue";
}

function localSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `browser-${crypto.randomUUID()}`
    : `browser-${Date.now()}-profile-wing`;
}

function shortHash(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function providerSetupMessage(reason: string) {
  if (reason === "developer_flag_missing")
    return "Set PROFILE_WING_CREATION_ENABLED=true and restart the local server.";
  if (reason === "provider_configuration_missing")
    return "Set PROFILE_WING_MASK_PROVIDER=remove-bg and restart the local server.";
  if (reason === "provider_credential_missing")
    return "Set REMOVE_BG_API_KEY in the server environment and restart. The key is never sent to the browser.";
  if (reason === "non_local_host")
    return "User-image processing is restricted to localhost in this milestone.";
  return "The local mask route is not ready.";
}

export function ProfileWingCreatorClient({
  forceThreeFailure = false,
  acceptedConceptHash,
  embedded = false,
  sourceMode = "all",
  hideResultPreview = false,
  onPrototypeChange,
}: {
  readonly forceThreeFailure?: boolean;
  readonly acceptedConceptHash?: string;
  readonly embedded?: boolean;
  readonly sourceMode?: "all" | "upload" | "accepted-concept";
  readonly hideResultPreview?: boolean;
  readonly onPrototypeChange?: (
    prototype: DerivedProfileWingPrototype | null,
  ) => void;
}) {
  const fileInputId = useId();
  const sessionId = useRef(localSessionId());
  const abortRef = useRef<AbortController | null>(null);
  const handoffAttemptedRef = useRef<string | null>(null);
  const generatedAutoProcessAttemptedRef = useRef<string | null>(null);
  const candidateRestoreAttemptedRef = useRef(false);
  const concepts = useLocalConceptWorkspace();
  const creation = useLocalProfileWingCreation();
  const designLibrary = useLocalDesignLibrary();
  const persistenceMode = usePersistenceMode();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(
    null,
  );
  const [prepared, setPrepared] = useState<PreparedProfileWingSource | null>(
    null,
  );
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [maskBlob, setMaskBlob] = useState<Blob | null>(null);
  const [prototype, setPrototype] =
    useState<DerivedProfileWingPrototype | null>(null);
  const [savedRevision, setSavedRevision] =
    useState<ProfileWingDesignRevision | null>(null);
  const [frameColor, setFrameColor] = useState<FrameColor>("blue");
  const [processing, setProcessing] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState({
    rights: false,
    provider: false,
    people: false,
    subject: false,
  });
  const sourceUrl = useObjectUrl(sourceBlob);
  const maskUrl = useObjectUrl(maskBlob);
  const currentCandidate = creation.currentCandidate;
  const currentDecision = creation.currentDecision;
  const reviewCandidate =
    currentCandidate &&
    prepared &&
    currentCandidate.source.contentHash === prepared.metadata.contentHash &&
    currentCandidate.source.sourceKind === prepared.metadata.sourceKind &&
    !(
      currentCandidate.provenance.provider === "deterministic-test" &&
      currentCandidate.provenance.adapterVersion !==
        DETERMINISTIC_CONCEPT_MASK_ADAPTER_VERSION
    )
      ? currentCandidate
      : null;
  const reviewReady = reviewCandidate !== null && maskBlob !== null;
  const acceptedConcept = concepts.workspace.concepts.find(
    (concept) => concept.conceptId === concepts.workspace.acceptedConceptId,
  );
  const acceptedConceptBatch = acceptedConcept
    ? concepts.workspace.batches.find(
        (batch) => batch.batchId === acceptedConcept.batchId,
      )
    : null;
  const acceptedConceptRequest = acceptedConcept
    ? concepts.workspace.requests.find(
        (request) => request.requestId === acceptedConcept.requestId,
      )
    : null;
  const generatedConceptSource =
    prepared?.metadata.sourceKind === "generated_concept";
  const generatedConceptUsesLocalProvider =
    generatedConceptSource &&
    (availability?.generatedConceptProvider === "deterministic-test" ||
      availability?.provider === "deterministic-test");
  const uploadConsentReady = Object.values(consent).every(Boolean);
  const consentReady = generatedConceptSource || uploadConsentReady;
  const providerReady = availability?.enabled === true;
  const providerActionStatus =
    availability === null
      ? "Checking the local remove.bg route…"
      : providerReady
        ? generatedConceptSource
          ? generatedConceptUsesLocalProvider
            ? "Local extraction runs automatically · no upload"
            : "One disclosed extraction request · zero automatic retries"
          : consentReady
            ? "Confirmations complete"
            : "All four confirmations are required"
        : providerSetupMessage(availability.reason);
  const vectorization = reviewCandidate?.vectorization ?? null;
  const needsAutoFitRefresh =
    vectorization?.status === "accepted" &&
    vectorization.silhouette.prototypeFit !== undefined &&
    String(vectorization.silhouette.prototypeFit.version) !==
      SILHOUETTE_PROTOTYPE_FIT_VERSION;
  const canAutoFit =
    (vectorization?.status === "rejected" &&
      silhouetteFindingsAllowPrototypeFit(vectorization.findings)) ||
    needsAutoFitRefresh;
  const savedRevisions = prototype
    ? designLibrary.revisions.filter(
        (revision) =>
          "designId" in revision &&
          revision.designId ===
            `local-profile-wing-${prototype.source.fixtureId}`,
      )
    : [];

  useEffect(() => {
    onPrototypeChange?.(prototype);
  }, [onPrototypeChange, prototype]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile-wings/mask", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ProviderAvailability;
        if (!cancelled) setAvailability(body);
      })
      .catch(() => {
        if (!cancelled)
          setAvailability({
            enabled: false,
            provider: null,
            generatedConceptProvider: null,
            reason: "route_unavailable",
            automaticRetries: 0,
            externalCallOccursOnlyOnPost: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (candidateRestoreAttemptedRef.current || !creation.hydrated) return;
    candidateRestoreAttemptedRef.current = true;
    if (
      !currentCandidate ||
      (currentCandidate.provenance.provider === "deterministic-test" &&
        currentCandidate.provenance.adapterVersion !==
          DETERMINISTIC_CONCEPT_MASK_ADAPTER_VERSION)
    )
      return;
    void Promise.all([
      getArtworkBlob(currentCandidate.source.contentHash),
      getArtworkBlob(currentCandidate.maskContentHash),
    ]).then(([source, mask]) => {
      if (cancelled) return;
      if (!source.ok || !mask.ok) {
        setError(
          "Stored source or mask bytes are unavailable on this device. The metadata remains visible but cannot be previewed.",
        );
        return;
      }
      setPrepared({
        metadata: currentCandidate.source,
        blob: source.value,
      });
      setSourceBlob(source.value);
      setMaskBlob(mask.value);
      if (currentDecision?.action === "accepted_for_future_prototyping") {
        const derived = deriveProfileWingPrototypeFromCreation({
          candidate: currentCandidate,
          decision: currentDecision,
          appearance: profileWingAppearance(frameColor),
        });
        if (derived.ok) setPrototype(derived.value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [creation.hydrated, currentCandidate, currentDecision, frameColor]);

  function resetConsent() {
    setConsent({
      rights: false,
      provider: false,
      people: false,
      subject: false,
    });
  }

  async function chooseUpload(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    setError(null);
    setStatus("");
    try {
      const next = await prepareProfileWingSource({
        blob: file,
        filename: file.name,
        declaredMediaType: file.type,
        sourceKind: "user_upload",
        sourceLabel: file.name,
      });
      setPrepared(next);
      setSourceBlob(next.blob);
      setMaskBlob(null);
      setPrototype(null);
      setSavedRevision(null);
      setFrameColor("blue");
      resetConsent();
      setStatus(
        "Local metadata-stripped derivative ready. Nothing has been uploaded.",
      );
    } catch (caught) {
      setPrepared(null);
      setSourceBlob(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The source image could not be prepared.",
      );
    } finally {
      setPreparing(false);
    }
  }

  const chooseAcceptedConcept = useCallback(
    async (expectedHash?: string) => {
      if (!acceptedConcept) {
        if (expectedHash)
          setError(
            "The accepted concept changed in another tab. Choose the current accepted concept or return to Concept Studio.",
          );
        return false;
      }
      if (
        expectedHash &&
        (!/^[a-f0-9]{64}$/.test(expectedHash) ||
          acceptedConcept.contentHash !== expectedHash)
      ) {
        setError(
          "The accepted concept changed in another tab. Choose the current accepted concept or return to Concept Studio.",
        );
        return false;
      }
      setPreparing(true);
      setError(null);
      setStatus("");
      try {
        const stored = await getArtworkBlob(acceptedConcept.contentHash);
        if (!stored.ok) throw new Error(stored.error.message);
        const next = await prepareProfileWingSource({
          blob: stored.value,
          filename: `concept-${acceptedConcept.ordinal}.${acceptedConcept.mediaType === "image/svg+xml" ? "svg" : acceptedConcept.mediaType.split("/")[1]}`,
          declaredMediaType: acceptedConcept.mediaType,
          sourceKind: "generated_concept",
          sourceLabel: `Accepted concept ${acceptedConcept.ordinal}`,
        });
        const storedMask =
          currentCandidate?.source.contentHash === next.metadata.contentHash &&
          currentCandidate.source.sourceKind === next.metadata.sourceKind &&
          !(
            currentCandidate.provenance.provider === "deterministic-test" &&
            currentCandidate.provenance.adapterVersion !==
              DETERMINISTIC_CONCEPT_MASK_ADAPTER_VERSION
          )
            ? await getArtworkBlob(currentCandidate.maskContentHash)
            : null;
        setPrepared(next);
        setSourceBlob(next.blob);
        setMaskBlob(storedMask?.ok ? storedMask.value : null);
        setPrototype(null);
        setSavedRevision(null);
        setFrameColor(
          frameColorFromDescription(acceptedConceptRequest?.constraints.colors),
        );
        resetConsent();
        setStatus(
          "Accepted concept prepared locally. Nothing has been uploaded.",
        );
        return true;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The accepted concept could not be prepared.",
        );
        return false;
      } finally {
        setPreparing(false);
      }
    },
    [acceptedConcept, acceptedConceptRequest, currentCandidate],
  );

  useEffect(() => {
    if (
      !acceptedConceptHash ||
      !concepts.hydrated ||
      handoffAttemptedRef.current === acceptedConceptHash
    )
      return;
    handoffAttemptedRef.current = acceptedConceptHash;
    void chooseAcceptedConcept(acceptedConceptHash).then((preparedLocally) => {
      if (preparedLocally)
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${window.location.search.includes("force3d=fail") ? "?force3d=fail" : ""}`,
        );
    });
  }, [acceptedConceptHash, chooseAcceptedConcept, concepts.hydrated]);

  const processSource = useCallback(async () => {
    if (!prepared || !consentReady || !availability?.enabled) return;
    setProcessing(true);
    setError(null);
    setStatus(
      availability.provider === "remove-bg" &&
        !generatedConceptUsesLocalProvider
        ? "One remove.bg request is in progress · zero automatic retries"
        : "Local deterministic mask simulation is in progress",
    );
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const form = new FormData();
      form.append(
        "image",
        new File([prepared.blob], `${prepared.metadata.sourceId}.jpg`, {
          type: prepared.metadata.mediaType,
        }),
      );
      form.append("sessionId", sessionId.current);
      form.append("sourceId", prepared.metadata.sourceId);
      form.append("sourceKind", prepared.metadata.sourceKind);
      form.append("sourceContentHash", prepared.metadata.contentHash);
      form.append(
        "generatedConceptSubject",
        generatedConceptSource
          ? (acceptedConceptRequest?.constraints.silhouetteSubject ?? "generic")
          : "",
      );
      form.append(
        "generatedConceptConversionConfirmed",
        String(generatedConceptSource),
      );
      form.append(
        "rightsConfirmed",
        String(!generatedConceptSource && consent.rights),
      );
      form.append(
        "providerDisclosureConfirmed",
        String(!generatedConceptSource && consent.provider),
      );
      form.append(
        "noIdentifiablePeopleConfirmed",
        String(!generatedConceptSource && consent.people),
      );
      form.append(
        "singleSubjectConfirmed",
        String(!generatedConceptSource && consent.subject),
      );
      const requestedAt = new Date().toISOString();
      const response = await fetch("/api/profile-wings/mask", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          readonly error?: {
            readonly kind?: string;
            readonly message?: string;
          };
        } | null;
        throw Object.assign(
          new Error(
            body?.error?.message ??
              `Background removal returned HTTP ${response.status}.`,
          ),
          { kind: body?.error?.kind ?? "provider_failure" },
        );
      }
      const returned = await response.blob();
      const bytes = await profileWingBlobBytes(returned);
      const maskContentHash = hashArtworkBytes(bytes);
      const stored = await storeContentAddressedBlob({
        contentHash: maskContentHash,
        blob: returned,
      });
      if (!stored.ok) throw new Error(stored.error.message);
      const raster = await rasterMaskFromCutout(returned, maskContentHash);
      const result = vectorizeSilhouetteMask(raster);
      const providerHeader = response.headers.get("x-profile-wing-provider");
      const provider =
        providerHeader === "remove-bg" ? "remove-bg" : "deterministic-test";
      const added = creation.addCandidate({
        source: prepared.metadata,
        maskContentHash,
        maskByteLength: returned.size,
        maskWidth: raster.width,
        maskHeight: raster.height,
        provenance: {
          provider,
          adapterVersion:
            response.headers.get("x-profile-wing-adapter-version") ?? "unknown",
          providerRequestId:
            response.headers.get("x-profile-wing-provider-request-id") ===
            "none"
              ? null
              : response.headers.get("x-profile-wing-provider-request-id"),
          requestedAt,
          automaticRetries: 0,
          requestCount: 1,
          outputMediaType: "image/png",
          privacyNote:
            provider === "remove-bg"
              ? "remove-bg-api-immediate-deletion"
              : "local-deterministic-no-upload",
        },
        vectorization: result,
        createdAt: new Date().toISOString(),
      });
      if (!added.ok) throw new Error(added.error.message);
      setMaskBlob(returned);
      setPrototype(null);
      setSavedRevision(null);
      setStatus(
        result.status === "accepted"
          ? "Mask returned and deterministic polygon passed. Visual acceptance is still required."
          : silhouetteFindingsAllowPrototypeFit(result.findings)
            ? "Mask returned with a usable subject. Its placement can be fitted locally without another remove.bg request."
            : "Mask returned, but deterministic validation rejected conversion. You may retain it or explicitly try again.",
      );
    } catch (caught) {
      const cancelled = controller.signal.aborted;
      setError(
        cancelled
          ? "Request cancelled locally. Provider usage may already have been incurred; nothing was retried."
          : caught instanceof Error
            ? caught.message
            : "Background removal failed. Nothing was retried automatically.",
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setProcessing(false);
    }
  }, [
    acceptedConceptRequest,
    availability,
    consent.people,
    consent.provider,
    consent.rights,
    consent.subject,
    consentReady,
    creation,
    generatedConceptSource,
    generatedConceptUsesLocalProvider,
    prepared,
  ]);

  useEffect(() => {
    if (
      !prepared ||
      prepared.metadata.sourceKind !== "generated_concept" ||
      !generatedConceptUsesLocalProvider ||
      reviewReady ||
      processing ||
      generatedAutoProcessAttemptedRef.current === prepared.metadata.contentHash
    )
      return;
    generatedAutoProcessAttemptedRef.current = prepared.metadata.contentHash;
    void processSource();
  }, [
    generatedConceptUsesLocalProvider,
    prepared,
    processSource,
    processing,
    reviewReady,
  ]);

  async function autoFitSilhouette() {
    const fitEligible =
      reviewCandidate?.vectorization.status === "rejected"
        ? silhouetteFindingsAllowPrototypeFit(
            reviewCandidate.vectorization.findings,
          )
        : reviewCandidate?.vectorization.status === "accepted" &&
          reviewCandidate.vectorization.silhouette.prototypeFit !== undefined &&
          String(
            reviewCandidate.vectorization.silhouette.prototypeFit.version,
          ) !== SILHOUETTE_PROTOTYPE_FIT_VERSION;
    if (!prepared || !maskBlob || !reviewCandidate || !fitEligible) return;
    setFitting(true);
    setError(null);
    setStatus(
      embedded
        ? "Fitting the existing mask inside the custom-wing safe area · no provider request"
        : "Fitting the existing mask inside the Profile Wing safe area · no provider request",
    );
    try {
      const raster = await rasterMaskFromCutout(
        maskBlob,
        reviewCandidate.maskContentHash,
      );
      const result = vectorizeSilhouetteMask(raster, {
        prototypeFit: "auto",
      });
      const added = creation.addCandidate({
        source: reviewCandidate.source,
        maskContentHash: reviewCandidate.maskContentHash,
        maskByteLength: reviewCandidate.maskByteLength,
        maskWidth: reviewCandidate.maskWidth,
        maskHeight: reviewCandidate.maskHeight,
        provenance: reviewCandidate.provenance,
        vectorization: result,
        createdAt: new Date().toISOString(),
      });
      if (!added.ok) throw new Error(added.error.message);
      setPrototype(null);
      setSavedRevision(null);
      setStatus(
        result.status === "accepted"
          ? "Silhouette auto-fit passed locally. No additional remove.bg request was made; visual acceptance is still required."
          : "The local auto-fit could not clear every deterministic rule. No additional remove.bg request was made.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The silhouette could not be fitted locally.",
      );
    } finally {
      setFitting(false);
    }
  }

  function decide(
    action: "accepted_for_future_prototyping" | "retained_without_conversion",
  ) {
    if (!reviewCandidate) return;
    const result = creation.decide(reviewCandidate.candidateId, action);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (action === "retained_without_conversion") {
      setPrototype(null);
      setSavedRevision(null);
      setStatus(
        "Source, returned mask, validation, and retain decision preserved locally. No product geometry was created.",
      );
      return;
    }
    const derived = deriveProfileWingPrototypeFromCreation({
      candidate: result.value.candidate,
      decision: result.value.decision,
      appearance: profileWingAppearance(frameColor),
    });
    if (!derived.ok) {
      setError(derived.error.message);
      return;
    }
    setPrototype(derived.value);
    setSavedRevision(null);
    setStatus(
      "User silhouette accepted. Matching 2.5D and 3D prototype geometry is ready; no revision exists until you save.",
    );
  }

  function selectFrameColor(nextColor: FrameColor) {
    setFrameColor(nextColor);
    if (
      !reviewCandidate ||
      currentDecision?.action !== "accepted_for_future_prototyping"
    )
      return;
    const derived = deriveProfileWingPrototypeFromCreation({
      candidate: reviewCandidate,
      decision: currentDecision,
      appearance: profileWingAppearance(nextColor),
    });
    if (!derived.ok) {
      setError(derived.error.message);
      return;
    }
    setPrototype(derived.value);
    setSavedRevision(null);
    setStatus(
      `${FRAME_LABELS[nextColor]} applied to the complete jump preview. Save creates a new exact revision.`,
    );
  }

  async function savePrototype() {
    if (!prototype) return;
    const saved = await designLibrary.saveGeneratedProfile(prototype);
    if (!saved.ok) {
      setError(saved.error.message);
      return;
    }
    setSavedRevision(saved.revision);
    setStatus(
      persistenceMode === "server"
        ? "Final immutable revision and canonical render saved to the server workspace. Processing evidence remains local."
        : embedded
          ? "Immutable custom-jump revision saved. Existing course placements were not changed."
          : "Immutable generated-prototype revision saved. Existing course placements were not changed.",
    );
  }

  function createAnother() {
    setPrepared(null);
    setSourceBlob(null);
    setMaskBlob(null);
    setPrototype(null);
    setSavedRevision(null);
    setFrameColor("blue");
    setError(null);
    setStatus("Choose another source. Previous evidence remains local.");
    resetConsent();
  }

  const Root = embedded ? "section" : "main";

  return (
    <Root
      className={`profile-creator-shell${embedded ? " is-embedded" : ""}`}
      aria-label={embedded ? "Build custom wings" : undefined}
    >
      {!embedded ? (
        <header className="profile-creator-header">
          <div>
            <strong>Customize a jump</strong>
            <span>Custom wings · image or accepted description</span>
          </div>
          <Link href="/designs/local-spj-04/edit">Change wing design</Link>
        </header>
      ) : null}

      {!embedded ? (
        <section className="profile-creator-hero">
          <div>
            <p className="eyebrow">Wing design · custom silhouette</p>
            <h1>Create custom wings for your jump.</h1>
            <p>
              Start with an image or an accepted description, validate the
              silhouette, then choose the jump color before saving the complete
              jump.{" "}
              {persistenceMode === "server"
                ? "Raw sources and processing history remain local. An explicit final save sends only the canonical render and immutable snapshot to your authenticated team workspace."
                : "Nothing leaves this browser until you explicitly request background removal."}
            </p>
          </div>
          <aside>
            <span className="prototype-status">Non-sellable prototype</span>
            <strong>
              {availability?.enabled
                ? availability.provider === "remove-bg"
                  ? "remove.bg ready"
                  : "Local QA provider ready"
                : "Provider setup required"}
            </strong>
            <p>One click · one request · zero automatic retries</p>
            <small>
              {availability?.enabled
                ? "Server-only credential · no key in browser code"
                : providerSetupMessage(availability?.reason ?? "checking")}
            </small>
          </aside>
        </section>
      ) : null}

      <ol className="profile-creator-stepper" aria-label="Creation progress">
        {[
          { label: "Source", complete: prepared !== null },
          {
            label: generatedConceptSource ? "Extract" : "Permission",
            complete: generatedConceptSource ? reviewReady : uploadConsentReady,
          },
          {
            label: "Inspect",
            complete: reviewReady,
          },
          { label: "Customize", complete: prototype !== null },
          { label: "Save", complete: savedRevision !== null },
        ].map((step, index) => {
          const active =
            !step.complete &&
            (index === 0 ||
              (index === 1 && prepared !== null) ||
              (index === 2 && reviewCandidate !== null) ||
              (index === 3 && prototype !== null) ||
              (index === 4 && prototype !== null));
          return (
            <li
              key={step.label}
              aria-current={active ? "step" : undefined}
              data-complete={step.complete}
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
              <small>
                {step.complete ? "Complete" : active ? "Current" : "Not ready"}
              </small>
            </li>
          );
        })}
      </ol>

      {creation.integrityError ? (
        <div className="profile-creator-alert" role="alert">
          <strong>Untrusted local creation history was rejected.</strong>
          <span>{creation.integrityError}</span>
        </div>
      ) : null}
      {error ? (
        <div className="profile-creator-alert" role="alert">
          <strong>
            {embedded
              ? "Custom wing creation stopped."
              : "Profile Wing creation stopped."}
          </strong>
          <span>{error}</span>
        </div>
      ) : null}
      <p
        className={`profile-creator-status${status ? " is-visible" : ""}`}
        role="status"
        aria-live="polite"
        data-testid="profile-creator-status"
      >
        {status}
      </p>

      <section
        className="profile-creator-source"
        aria-labelledby="source-title"
      >
        <div className="profile-creator-section-heading">
          <span>01</span>
          <div>
            <p className="eyebrow">Choose source</p>
            <h2 id="source-title">Start with one clear subject.</h2>
          </div>
        </div>
        <div
          className={`profile-creator-source-grid${sourceMode !== "all" ? " is-single-source" : ""}`}
        >
          {sourceMode !== "accepted-concept" ? (
            <article>
              <p className="eyebrow">Upload</p>
              <h3>PNG or JPEG</h3>
              <p>
                Up to 10 MiB. The browser creates a metadata-stripped derivative
                up to 2,048 px and stores it locally by SHA-256.
              </p>
              <label
                className="profile-creator-file-action"
                htmlFor={fileInputId}
              >
                {preparing ? "Preparing source…" : "Choose image"}
              </label>
              <input
                id={fileInputId}
                className="visually-hidden-file"
                type="file"
                accept="image/png,image/jpeg"
                disabled={preparing || processing}
                onChange={(event) => void chooseUpload(event.target.files?.[0])}
              />
            </article>
          ) : null}
          {sourceMode !== "upload" ? (
            <article>
              <p className="eyebrow">Description result</p>
              <h3>Accepted wing concept</h3>
              {acceptedConcept ? (
                <>
                  <p>
                    Concept {acceptedConcept.ordinal} ·{" "}
                    {acceptedConceptBatch?.provenance.provider ===
                    "deterministic-test"
                      ? "simulator fixture"
                      : "live generated image"}
                  </p>
                  <code>{shortHash(acceptedConcept.contentHash)}</code>
                  <button
                    type="button"
                    onClick={() => void chooseAcceptedConcept()}
                    disabled={preparing || processing}
                  >
                    Use accepted concept
                  </button>
                </>
              ) : (
                <p>
                  No accepted description result is available in this browser.
                </p>
              )}
            </article>
          ) : null}
        </div>
        {prepared && sourceUrl ? (
          <div className="profile-creator-selected-source">
            <div className="profile-source-preview">
              {/* Content is a local, hash-verified derivative. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sourceUrl} alt={prepared.metadata.sourceLabel} />
            </div>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{prepared.metadata.sourceLabel}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{prepared.metadata.sourceKind.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Derivative</dt>
                <dd>
                  {prepared.metadata.pixelWidth} ×{" "}
                  {prepared.metadata.pixelHeight} ·{" "}
                  {Math.ceil(prepared.metadata.byteLength / 1024)} KiB
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{prepared.metadata.contentHash}</code>
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      {prepared && (!generatedConceptSource || !reviewReady) ? (
        <section
          className="profile-creator-provider"
          aria-labelledby="provider-title"
        >
          <div className="profile-creator-section-heading">
            <span>02</span>
            <div>
              <p className="eyebrow">
                {generatedConceptSource
                  ? "Concept to product shape"
                  : "Explicit provider boundary"}
              </p>
              <h2 id="provider-title">
                {generatedConceptSource
                  ? "Extract the wing silhouette."
                  : "Confirm before upload."}
              </h2>
            </div>
          </div>
          <div className="profile-creator-consent">
            {generatedConceptSource ? (
              <div>
                <p>
                  Concept art is not product geometry yet. We isolate and
                  validate one wing silhouette before building the matching 2.5D
                  and 3D preview.
                </p>
                <p>
                  {generatedConceptUsesLocalProvider
                    ? "The simulator performs this extraction locally and automatically. Nothing is uploaded."
                    : "This sends the app-generated concept to remove.bg once. Nothing is retried automatically."}
                </p>
              </div>
            ) : (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={consent.rights}
                    onChange={(event) =>
                      setConsent((current) => ({
                        ...current,
                        rights: event.target.checked,
                      }))
                    }
                  />
                  I own this image or have the right to use it.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consent.provider}
                    onChange={(event) =>
                      setConsent((current) => ({
                        ...current,
                        provider: event.target.checked,
                      }))
                    }
                  />
                  I understand this derivative is sent to remove.bg only when I
                  press the processing button. remove.bg documents immediate API
                  image deletion.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consent.people}
                    onChange={(event) =>
                      setConsent((current) => ({
                        ...current,
                        people: event.target.checked,
                      }))
                    }
                  />
                  The image contains no identifiable person.
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={consent.subject}
                    onChange={(event) =>
                      setConsent((current) => ({
                        ...current,
                        subject: event.target.checked,
                      }))
                    }
                  />
                  It contains one clear subject suitable for a solid outer
                  silhouette.
                </label>
              </>
            )}
            <div className="profile-creator-provider-actions">
              {!generatedConceptSource || !generatedConceptUsesLocalProvider ? (
                <button
                  type="button"
                  onClick={() => void processSource()}
                  disabled={
                    !consentReady || !providerReady || processing || fitting
                  }
                >
                  {processing
                    ? "Processing one request…"
                    : !providerReady
                      ? "remove.bg setup required"
                      : reviewCandidate
                        ? availability?.provider === "remove-bg"
                          ? "Try remove.bg again"
                          : "Run local mask simulation again"
                        : generatedConceptSource
                          ? "Extract & inspect wing shape"
                          : availability?.provider === "remove-bg"
                            ? "Remove background & inspect"
                            : "Run local mask simulation"}
                </button>
              ) : null}
              {processing ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancel locally
                </button>
              ) : null}
              <span>{providerActionStatus}</span>
            </div>
          </div>
        </section>
      ) : null}

      {reviewCandidate && maskUrl ? (
        <section
          className="profile-creator-review"
          aria-labelledby="creation-review-title"
        >
          <div className="profile-creator-section-heading">
            <span>03</span>
            <div>
              <p className="eyebrow">Mask and polygon review</p>
              <h2 id="creation-review-title">
                Decide what this result permits.
              </h2>
            </div>
          </div>
          <div className="profile-creator-compare">
            <figure>
              <div className="profile-source-preview">
                {/* Local source derivative. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceUrl ?? ""} alt="Selected source" />
              </div>
              <figcaption>Local source derivative</figcaption>
            </figure>
            <figure>
              <div className="profile-mask-preview">
                {/* Hash-verified provider cutout. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={maskUrl} alt="Returned transparent cutout" />
              </div>
              <figcaption>Returned cutout and alpha mask</figcaption>
            </figure>
            <figure>
              <div className="profile-polygon-preview">
                {vectorization?.status === "accepted" ? (
                  <svg
                    viewBox="0 0 10000 10000"
                    role="img"
                    aria-label={`Canonical polygon with ${vectorization.silhouette.points.length} vertices`}
                  >
                    <polygon
                      points={vectorization.silhouette.points
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                    />
                  </svg>
                ) : (
                  <div>
                    <strong>×</strong>
                    <span>No product geometry</span>
                  </div>
                )}
              </div>
              <figcaption>
                {vectorization?.status === "accepted"
                  ? "Deterministic canonical polygon"
                  : "Deterministic rejection"}
              </figcaption>
            </figure>
          </div>
          <div className="profile-creator-review-evidence">
            <div>
              <span>Provider</span>
              <strong>{reviewCandidate.provenance.provider}</strong>
            </div>
            <div>
              <span>Requests / retries</span>
              <strong>1 / 0</strong>
            </div>
            <div>
              <span>Mask SHA-256</span>
              <code>{shortHash(reviewCandidate.maskContentHash)}</code>
            </div>
            <div>
              <span>Result</span>
              <strong>{vectorization?.status}</strong>
            </div>
          </div>
          {vectorization?.status === "rejected" ? (
            <div className="profile-creator-findings">
              <h3>
                {canAutoFit
                  ? "Placement needs adjustment"
                  : "Why conversion stopped"}
              </h3>
              <ul>
                {vectorization.findings.map((finding) => (
                  <li key={finding.code}>
                    <code>{finding.code}</code>
                    <span>{finding.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {vectorization?.status === "accepted" &&
          vectorization.silhouette.prototypeFit ? (
            <p className="profile-creator-status is-visible">
              {needsAutoFitRefresh
                ? "A shape-preserving fit update is ready. It reuses the original remove.bg cutout and makes no additional provider request."
                : "Auto-fit applied · the original remove.bg cutout is unchanged · aspect ratio, scale, and placement were preserved locally above the attachment region · no additional provider request"}
            </p>
          ) : null}
          <div className="profile-creator-decision-actions">
            {canAutoFit ? (
              <button
                type="button"
                onClick={() => void autoFitSilhouette()}
                disabled={fitting}
              >
                {fitting
                  ? "Fitting silhouette locally…"
                  : needsAutoFitRefresh
                    ? "Refresh shape-preserving fit · no new remove.bg call"
                    : "Auto-fit silhouette · no new remove.bg call"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => decide("accepted_for_future_prototyping")}
                disabled={vectorization?.status !== "accepted"}
              >
                {vectorization?.status === "accepted"
                  ? embedded
                    ? "Accept custom wing shape"
                    : "Accept & build Profile Wing"
                  : "Cannot accept rejected result"}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => decide("retained_without_conversion")}
            >
              Retain without conversion
            </button>
            <span>
              {currentDecision
                ? `Current: ${currentDecision.action.replaceAll("_", " ")}`
                : "No visual decision recorded yet"}
            </span>
          </div>
        </section>
      ) : null}

      {prototype ? (
        <>
          <section
            className="profile-creator-result"
            aria-labelledby="result-title"
          >
            <div className="profile-creator-section-heading">
              <span>04</span>
              <div>
                <p className="eyebrow">Customize the complete jump</p>
                <h2 id="result-title">Shape approved. Choose the color.</h2>
              </div>
            </div>
            <div className="profile-creator-appearance">
              <div>
                <p className="eyebrow">Shared jump appearance</p>
                <h3>Frame and wing color</h3>
                <p>
                  The custom silhouette replaces the standard wing panels. The
                  four-pole jump structure, supports, exact color, and profile
                  are saved together as one revision.
                </p>
              </div>
              <div
                className="profile-creator-color-options"
                role="radiogroup"
                aria-label="Frame and wing color"
              >
                {FRAME_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={frameColor === color}
                    aria-label={`${FRAME_LABELS[color]} frame and wings${frameColor === color ? ", selected" : ""}`}
                    disabled={savedRevision !== null}
                    onClick={() => selectFrameColor(color)}
                  >
                    <span
                      className={`swatch swatch-${color}`}
                      aria-hidden="true"
                    />
                    <strong>{FRAME_LABELS[color]}</strong>
                    <small>
                      {frameColor === color ? "Selected" : "Choose color"}
                    </small>
                  </button>
                ))}
              </div>
            </div>
            {!hideResultPreview ? (
              <div className="profile-creator-result-stage">
                <ProfileWingThreeStage
                  manifest={prototype.renderManifest}
                  reducedMotion={false}
                  forceFailure={forceThreeFailure}
                />
              </div>
            ) : null}
            <div className="profile-creator-save">
              <div>
                <strong>{prototype.source.sourceLabel}</strong>
                <code>
                  GEO {shortHash(prototype.renderManifest.geometrySha256)}
                </code>
                <p>
                  {embedded ? "Custom geometry" : "Generated"} · inferred · not
                  supplier-confirmed · not for production or ordering.
                </p>
              </div>
              <div>
                <span className="eyebrow">05 / Save complete jump</span>
                <button
                  type="button"
                  onClick={() => void savePrototype()}
                  disabled={
                    !designLibrary.hydrated ||
                    !designLibrary.library ||
                    savedRevision !== null
                  }
                >
                  {savedRevision
                    ? `Revision ${String(savedRevision.ordinal).padStart(
                        2,
                        "0",
                      )} saved`
                    : "Save immutable generated revision"}
                </button>
                {savedRevision ? (
                  <>
                    <Link href={`/designs/${savedRevision.designId}`}>
                      View saved design
                    </Link>
                    <Link
                      href={`/courses/local-course-1?revision=${encodeURIComponent(
                        savedRevision.revisionId,
                      )}`}
                    >
                      Add Revision{" "}
                      {String(savedRevision.ordinal).padStart(2, "0")} to course
                    </Link>
                  </>
                ) : (
                  <span>Save a revision to add it to a course.</span>
                )}
                {persistenceMode === "server" ? (
                  <span>
                    Final revision and canonical render: server workspace.
                    Processing evidence: this browser only.
                  </span>
                ) : null}
                <button
                  type="button"
                  className="secondary"
                  onClick={createAnother}
                >
                  Create another
                </button>
                <span>
                  {savedRevisions.length} saved revision
                  {savedRevisions.length === 1 ? "" : "s"} for this design
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <footer className="profile-creator-boundary">
        <strong>Prototype boundary</strong>
        <p>
          This flow creates inferred browser-local geometry only. It does not
          establish material, thickness, support, fabrication, structural, wind,
          horse-safety, federation, supplier, price, tax, delivery, or ordering
          truth.
        </p>
      </footer>
    </Root>
  );
}

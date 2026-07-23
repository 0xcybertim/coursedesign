"use client";

import { useEffect, useMemo, useState } from "react";
import type { LocalConceptWorkspace } from "@/domain/generation";
import { getArtworkBlob } from "@/lib/browser/artifact-store";

export function ConceptGallery(props: {
  readonly workspace: LocalConceptWorkspace;
  readonly onSelect: (conceptId: string) => void;
  readonly onRefine: (conceptId: string) => void;
  readonly disabled: boolean;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      props.workspace.concepts.map(async (concept) => {
        const blob = await getArtworkBlob(concept.contentHash);
        if (cancelled) return;
        if (!blob.ok) {
          setMissing((current) => ({
            ...current,
            [concept.conceptId]: `${blob.error.kind}: ${blob.error.message}`,
          }));
          return;
        }
        const url = URL.createObjectURL(blob.value);
        created.push(url);
        setUrls((current) => ({ ...current, [concept.conceptId]: url }));
      }),
    );
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [props.workspace.concepts]);

  const batches = useMemo(
    () => [...props.workspace.batches].reverse(),
    [props.workspace.batches],
  );

  if (batches.length === 0)
    return (
      <div className="concept-gallery-empty">
        <strong>No concepts yet.</strong>
        <p>
          Your first immutable four-result batch will remain here after
          generation.
        </p>
      </div>
    );

  return (
    <div className="concept-history" aria-label="Immutable concept history">
      {batches.map((batch, batchIndex) => (
        <section className="concept-batch" key={batch.batchId}>
          <header>
            <div>
              <p className="eyebrow">
                {batch.relation === "initial"
                  ? "Initial batch"
                  : batch.relation === "regenerate"
                    ? "Sibling batch"
                    : "Refinement child"}
                {" · "}
                {String(props.workspace.batches.length - batchIndex).padStart(
                  2,
                  "0",
                )}
              </p>
              <h2>
                {batch.provenance.provider === "deterministic-test"
                  ? "Four deterministic fixture previews"
                  : "Four concept directions"}
              </h2>
            </div>
            <div className="concept-provenance">
              <span>
                {batch.provenance.provider === "deterministic-test"
                  ? "Workflow simulator · fixture output"
                  : "Live OpenAI output"}
              </span>
              <code>{batch.provenance.configuredModel}</code>
              <code>{batch.provenance.adapterVersion}</code>
            </div>
          </header>
          <div
            className="concept-grid"
            role="radiogroup"
            aria-label={`Concepts in batch ${batchIndex + 1}`}
          >
            {batch.conceptIds.map((conceptId) => {
              const concept = props.workspace.concepts.find(
                (item) => item.conceptId === conceptId,
              );
              if (!concept) return null;
              const selected =
                props.workspace.selectedConceptId === concept.conceptId;
              return (
                <article
                  className="concept-card"
                  data-selected={selected || undefined}
                  key={concept.conceptId}
                >
                  <div className="concept-image-frame">
                    {urls[concept.conceptId] ? (
                      // Content comes from hash-verified browser-local bytes.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urls[concept.conceptId]}
                        alt={
                          batch.provenance.provider === "deterministic-test"
                            ? `Deterministic fixture ${concept.ordinal}; workflow simulation only`
                            : `Generated concept ${concept.ordinal}; unvalidated concept only`
                        }
                      />
                    ) : missing[concept.conceptId] ? (
                      <p role="alert">{missing[concept.conceptId]}</p>
                    ) : (
                      <p>Loading local concept bytes…</p>
                    )}
                    <span>
                      {batch.provenance.provider === "deterministic-test"
                        ? "Deterministic fixture"
                        : "Concept only"}
                    </span>
                  </div>
                  <div className="concept-card-actions">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => props.onSelect(concept.conceptId)}
                      disabled={
                        props.disabled || Boolean(missing[concept.conceptId])
                      }
                    >
                      {selected
                        ? "Selected"
                        : `Select concept ${concept.ordinal}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onRefine(concept.conceptId)}
                      disabled={
                        props.disabled || Boolean(missing[concept.conceptId])
                      }
                    >
                      Refine
                    </button>
                  </div>
                  <code title={concept.contentHash}>
                    IMG {concept.contentHash.slice(0, 12)}
                  </code>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

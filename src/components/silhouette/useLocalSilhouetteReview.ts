"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LOCAL_SILHOUETTE_REVIEW_KEY,
  appendSilhouetteDecision,
  createEmptySilhouetteReview,
  currentSilhouetteDecisions,
  parseLocalSilhouetteReview,
  serializeLocalSilhouetteReview,
  type SilhouetteDecisionAction,
} from "@/domain/silhouette";

function decisionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `silhouette-decision-${crypto.randomUUID()}`
    : `silhouette-decision-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useLocalSilhouetteReview() {
  const [review, setReview] = useState(() => createEmptySilhouetteReview());
  const reviewRef = useRef(review);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState(
    "Checking browser-local decisions…",
  );
  const [integrityError, setIntegrityError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const now = new Date().toISOString();
      try {
        const stored = localStorage.getItem(LOCAL_SILHOUETTE_REVIEW_KEY);
        if (!stored) {
          const fresh = createEmptySilhouetteReview(now);
          reviewRef.current = fresh;
          setReview(fresh);
          localStorage.setItem(
            LOCAL_SILHOUETTE_REVIEW_KEY,
            serializeLocalSilhouetteReview(fresh),
          );
          setPersistenceStatus("Empty review saved on this device");
        } else {
          const parsed = parseLocalSilhouetteReview(stored);
          if (parsed.ok) {
            reviewRef.current = parsed.value;
            setReview(parsed.value);
            setPersistenceStatus("Review decisions restored on this device");
          } else {
            const fresh = createEmptySilhouetteReview(now);
            reviewRef.current = fresh;
            setReview(fresh);
            setIntegrityError(`${parsed.error.kind}: ${parsed.error.message}`);
            localStorage.setItem(
              LOCAL_SILHOUETTE_REVIEW_KEY,
              serializeLocalSilhouetteReview(fresh),
            );
            setPersistenceStatus(
              "Untrusted review rejected · fresh decision record started",
            );
          }
        }
      } catch {
        setPersistenceStatus(
          "Browser metadata storage is unavailable · decisions last for this tab only",
        );
      }
      setHydrated(true);
    });
  }, []);

  function decide(fixtureId: string, action: SilhouetteDecisionAction) {
    const result = appendSilhouetteDecision(reviewRef.current, {
      decisionId: decisionId(),
      fixtureId,
      action,
      createdAt: new Date().toISOString(),
    });
    if (!result.ok) return result;
    reviewRef.current = result.value;
    setReview(result.value);
    try {
      localStorage.setItem(
        LOCAL_SILHOUETTE_REVIEW_KEY,
        serializeLocalSilhouetteReview(result.value),
      );
      setPersistenceStatus("Decision appended to browser-local review");
    } catch {
      setPersistenceStatus(
        "Browser metadata storage is unavailable · decision lasts for this tab only",
      );
    }
    return result;
  }

  return {
    review,
    current: useMemo(() => currentSilhouetteDecisions(review), [review]),
    hydrated,
    persistenceStatus,
    integrityError,
    decide,
  };
}

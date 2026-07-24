const COPY = {
  local: {
    badge: "Local prototype",
    sentence:
      "Saved only in this browser. There is no account, backup, synchronization, or cross-device access.",
  },
  concept: {
    badge: "Visual concept",
    sentence:
      "Concept imagery is not obstacle geometry, supplier truth, or a production specification.",
  },
  "generated-design": {
    badge: "Generated · inferred",
    sentence:
      "The silhouette, dimensions, supports, and quantities are inferred and not supplier-confirmed.",
  },
  course: {
    badge: "Planning prototype",
    sentence:
      "Course geometry is advisory planning information, not safety, federation, venue, or production certification.",
  },
  provider: {
    badge: "External processing",
    sentence:
      "Image processing happens only after the explicit rights, privacy, person, and single-subject confirmations and one user action.",
  },
} as const;

export function PrototypeBoundary({
  variant,
  detail,
}: {
  readonly variant: keyof typeof COPY;
  readonly detail?: React.ReactNode;
}) {
  const copy = COPY[variant];
  return (
    <section
      className="prototype-boundary"
      data-variant={variant}
      aria-label={`${copy.badge} boundary`}
    >
      <strong>{copy.badge}</strong>
      <p>{copy.sentence}</p>
      {detail ? (
        <details>
          <summary>Technical boundary</summary>
          <div>{detail}</div>
        </details>
      ) : null}
    </section>
  );
}

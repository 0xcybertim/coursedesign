import { createHash } from "node:crypto";

export const PHASE_1H_APPROVAL_TEXT =
  "I approve the Phase 1H-A Photoroom benchmark: 20 clean + 3 empty + 3 multi-subject + 3 badly occluded synthetic fixtures, exactly 29 maximum external calls, zero retries, maximum cost $0.58, expected 30–90 seconds, and upload of only those repository-generated PNG fixtures. I accept that Photoroom excludes API images from training but does not publish an exact transient API-image deletion interval." as const;

export const PHASE_1H_APPROVAL_TEXT_SHA256 = createHash("sha256")
  .update(PHASE_1H_APPROVAL_TEXT)
  .digest("hex");

export interface LiveBenchmarkAuthorization {
  readonly schemaVersion: "1.0.0-phase1h-a-authorization";
  readonly status: "approved";
  readonly approvedBy: "Tim";
  readonly approvedAt: string;
  readonly approvalText: typeof PHASE_1H_APPROVAL_TEXT;
  readonly approvalTextSha256: string;
  readonly provider: "photoroom";
  readonly fixtureCounts: {
    readonly clean: 20;
    readonly empty: 3;
    readonly multiSubject: 3;
    readonly badlyOccluded: 3;
    readonly total: 29;
  };
  readonly maximumExternalCalls: 29;
  readonly maxRetries: 0;
  readonly maximumCostUsd: 0.58;
  readonly expectedLatency: "30-90 seconds";
  readonly dataLeavingMachine: "Only the 29 repository-generated 480 x 480 PNG fixture inputs";
  readonly privacyAccepted: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateLiveBenchmarkAuthorization(
  value: unknown,
): value is LiveBenchmarkAuthorization {
  if (!isRecord(value) || !isRecord(value.fixtureCounts)) return false;
  const counts = value.fixtureCounts;
  return (
    value.schemaVersion === "1.0.0-phase1h-a-authorization" &&
    value.status === "approved" &&
    value.approvedBy === "Tim" &&
    typeof value.approvedAt === "string" &&
    !Number.isNaN(Date.parse(value.approvedAt)) &&
    value.approvalText === PHASE_1H_APPROVAL_TEXT &&
    value.approvalTextSha256 === PHASE_1H_APPROVAL_TEXT_SHA256 &&
    value.provider === "photoroom" &&
    counts.clean === 20 &&
    counts.empty === 3 &&
    counts.multiSubject === 3 &&
    counts.badlyOccluded === 3 &&
    counts.total === 29 &&
    value.maximumExternalCalls === 29 &&
    value.maxRetries === 0 &&
    value.maximumCostUsd === 0.58 &&
    value.expectedLatency === "30-90 seconds" &&
    value.dataLeavingMachine ===
      "Only the 29 repository-generated 480 x 480 PNG fixture inputs" &&
    value.privacyAccepted === true
  );
}

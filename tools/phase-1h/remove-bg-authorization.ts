import { createHash } from "node:crypto";

export const REMOVE_BG_APPROVAL_TEXT =
  "I approve the Phase 1H-A remove.bg free-preview benchmark: 20 clean + 3 empty + 3 multi-subject + 3 badly occluded synthetic fixtures, exactly 29 maximum external calls, zero retries, maximum cost $0, expected 30–90 seconds, and upload of only those repository-generated PNG fixtures. I accept that remove.bg deletes API images immediately after processing and does not provide a comparable uncertainty score, so deterministic metrics plus mandatory visual inspection will decide the gate." as const;

export const REMOVE_BG_APPROVAL_TEXT_SHA256 = createHash("sha256")
  .update(REMOVE_BG_APPROVAL_TEXT)
  .digest("hex");

export interface RemoveBgLiveBenchmarkAuthorization {
  readonly schemaVersion: "1.0.0-phase1h-a-remove-bg-authorization";
  readonly status: "approved";
  readonly approvedBy: "Tim";
  readonly approvedAt: string;
  readonly approvalText: typeof REMOVE_BG_APPROVAL_TEXT;
  readonly approvalTextSha256: string;
  readonly provider: "remove-bg";
  readonly fixtureCounts: {
    readonly clean: 20;
    readonly empty: 3;
    readonly multiSubject: 3;
    readonly badlyOccluded: 3;
    readonly total: 29;
  };
  readonly maximumExternalCalls: 29;
  readonly maxRetries: 0;
  readonly maximumCostUsd: 0;
  readonly expectedLatency: "30-90 seconds";
  readonly dataLeavingMachine: "Only the 29 repository-generated 480 x 480 PNG fixture inputs";
  readonly privacyAccepted: true;
  readonly providerUncertaintyRequired: false;
  readonly mandatoryVisualInspection: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateRemoveBgLiveBenchmarkAuthorization(
  value: unknown,
): value is RemoveBgLiveBenchmarkAuthorization {
  if (!isRecord(value) || !isRecord(value.fixtureCounts)) return false;
  const counts = value.fixtureCounts;
  return (
    value.schemaVersion === "1.0.0-phase1h-a-remove-bg-authorization" &&
    value.status === "approved" &&
    value.approvedBy === "Tim" &&
    typeof value.approvedAt === "string" &&
    !Number.isNaN(Date.parse(value.approvedAt)) &&
    value.approvalText === REMOVE_BG_APPROVAL_TEXT &&
    value.approvalTextSha256 === REMOVE_BG_APPROVAL_TEXT_SHA256 &&
    value.provider === "remove-bg" &&
    counts.clean === 20 &&
    counts.empty === 3 &&
    counts.multiSubject === 3 &&
    counts.badlyOccluded === 3 &&
    counts.total === 29 &&
    value.maximumExternalCalls === 29 &&
    value.maxRetries === 0 &&
    value.maximumCostUsd === 0 &&
    value.expectedLatency === "30-90 seconds" &&
    value.dataLeavingMachine ===
      "Only the 29 repository-generated 480 x 480 PNG fixture inputs" &&
    value.privacyAccepted === true &&
    value.providerUncertaintyRequired === false &&
    value.mandatoryVisualInspection === true
  );
}

# Phase 1H-A subject-mask benchmark report

Date: 2026-07-22  
Provider: Photoroom Remove Background API, sandbox mode  
Final status: **completed; sandbox output failed the provider-quality gate**

This report is the historical Photoroom sandbox result. The later separately authorized remove.bg free-preview benchmark passed; see `REMOVE_BG_BENCHMARK_REPORT.md` for the final Phase 1H-A provider decision.

## Result

Tim approved the exact synthetic-data, privacy, request-count, retry, latency, and maximum-cost contract before dispatch. The bounded run then made exactly 29 calls in manifest order, one per fixture, with zero retries. All 29 requests returned HTTP 200 grayscale PNG masks.

The predeclared binary evaluator reported:

- 20/20 clean masks accepted;
- 3/3 empty cases rejected;
- 3/3 multi-subject cases rejected;
- 3/3 badly occluded cases rejected;
- 409 ms median, 494 ms p90, and 1,178 ms maximum latency.

Those automated numbers validate the endpoint and benchmark plumbing, but they do **not** establish usable provider quality. Visual inspection found Photoroom's repeated diagonal sandbox watermark across every saved grayscale mask. Because the watermark creates non-subject marks and holes that can survive or evade the binary threshold, no sandbox mask is safe input for deterministic vectorization. The evidence therefore records `automatedMetricGatePassed: true`, `cleanMasksEligibleForVectorization: 0`, and final `technicalGatePassed: false`.

## Cost and data boundary

- Billing mode: free Photoroom sandbox; expected provider charge $0.00.
- Authorization cap: $0.58; it was not exceeded.
- Uploaded data: only the 29 repository-generated 480 x 480 PNG fixtures.
- No user image, Phase 1G concept, prompt, credential, logo, or scraped media was uploaded.
- The supplied key was held in process memory only and is absent from repository files and evidence.

## Decision

Phase 1H-A is complete as an honest failed/inconclusive free-provider benchmark. It proves that the Photoroom integration, mask format, uncertainty response, latency recording, deterministic metrics, negative-case rejection, and credential-free evidence path work. It does not prove clean unwatermarked mask quality, and it does not authorize Phase 1H-B.

No additional provider request is authorized. The next honest gate is a separately approved clean-mask benchmark: either a regular Photoroom run or a no-watermark free provider with an adapted harness. Do not begin vectorization or product integration until that benchmark passes.

## Evidence

- `live-benchmark-authorization.json` — exact user approval; no credential.
- `live-benchmark-results.json` — 29-call redacted machine evidence and final sandbox limitation.
- `live-masks/` — 29 returned 480 x 480 grayscale masks for visual audit.
- `local-validation.json` — zero-call evaluator validation only.
- `benchmark-manifest.json` — deterministic fixture hashes and rights basis.

## Fixture limitation

The corpus uses deterministic flat raster illustrations with textured backgrounds. It covers ten animal and ten object categories plus explicit negative scenes, but it does not represent the photographic diversity of future user uploads or Phase 1G concept art. Even an unwatermarked pass would justify only a separately proposed Phase 1H-B experiment, not production suitability.

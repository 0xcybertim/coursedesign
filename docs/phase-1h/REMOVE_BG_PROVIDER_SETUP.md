# Phase 1H-A remove.bg provider setup

Date: 2026-07-22  
Status: **authorized benchmark complete; provider-quality gate passed**

## Why remove.bg is the selected free follow-up

The Photoroom sandbox benchmark proved the integration path but watermarked every output. Tim chose to switch the next benchmark to remove.bg.

The current remove.bg free account allowance covers 50 preview API calls per month. Preview output is capped at 0.25 megapixels; each deterministic fixture is 480 x 480, or 0.2304 megapixels. The API can return a transparent PNG, and the isolated adapter deterministically extracts its alpha channel into the same grayscale-mask format used by the existing evaluator.

remove.bg states that API inputs and results are deleted immediately after processing. It does not expose an uncertainty score comparable to Photoroom. The benchmark therefore keeps the same geometry thresholds and adds mandatory human visual inspection before any output can be considered eligible for vectorization.

## Prepared boundary

- Exactly 20 clean, 3 empty, 3 multi-subject, and 3 badly occluded synthetic fixtures.
- Exactly 29 maximum external calls, one attempt per fixture, zero retries.
- `size=preview`, `format=png`, and `type=auto` on every request.
- Maximum provider cost: $0 under the documented monthly free preview allowance.
- Only repository-generated 480 x 480 PNG inputs may leave the machine.
- The key is process-memory only and must not enter files, logs, evidence, or browser storage.
- Returned alpha masks and credential-free request/cost/latency evidence are written under remove.bg-specific filenames so the historical Photoroom evidence remains immutable.
- No vectorization, geometry, product revision, course integration, application route, account system, deployment, commerce, fabrication, safety, or supplier claim.

## Local verification

The adapter and gate can be verified without an external call through the Phase 1H evaluation test and normal repository quality checks. Live mode remains locked until the exact authorization exists.

## Exact approval sentence

> I approve the Phase 1H-A remove.bg free-preview benchmark: 20 clean + 3 empty + 3 multi-subject + 3 badly occluded synthetic fixtures, exactly 29 maximum external calls, zero retries, maximum cost $0, expected 30–90 seconds, and upload of only those repository-generated PNG fixtures. I accept that remove.bg deletes API images immediately after processing and does not provide a comparable uncertainty score, so deterministic metrics plus mandatory visual inspection will decide the gate.

After approval, the key is supplied to the process as `REMOVE_BG_API_KEY` and the bounded command is:

```bash
PHASE_1H_LIVE_APPROVED=true \
REMOVE_BG_API_KEY='<server-only key>' \
pnpm benchmark:phase1h:remove-bg:live -- \
  --approved-provider=remove-bg \
  --approved-calls=29 \
  --approved-max-cost-usd=0 \
  --approved-privacy=synthetic-only-api-immediate-deletion
```

The automated run produced provisional evidence, followed by mandatory inspection of every returned mask. Final results are recorded in `REMOVE_BG_BENCHMARK_REPORT.md` and `remove-bg-live-benchmark-results.json`.

## Completed result

- Exactly 29 requests dispatched; zero retries; maximum and observed charge $0.
- 26 masks returned with HTTP 200; the 3 empty scenes were explicitly rejected with HTTP 400 and no invented mask.
- Automated gate: 20/20 clean accepted; 3/3 empty, 3/3 multi-subject, and 3/3 badly occluded rejected.
- Visual gate: all 20 clean masks were crisp and free of visible watermarking, halos, holes, clipping, and extra subjects. All six returned unsafe-case masks visibly demonstrated the declared rejection condition.
- Latency: 521 ms median, 1,201 ms p90, 3,114 ms maximum.
- Final Phase 1H-A remove.bg provider-quality gate: **passed**.
- No additional provider request and no Phase 1H-B vectorization work is authorized by this result.

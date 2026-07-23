# Phase 1H-A subject-mask benchmark implementation

## Status

Research, the recommendation, the finite generated-fixture corpus, the isolated Photoroom adapter, objective evaluator, and credential-free evidence format are implemented. Tim approved the exact bounded contract on 2026-07-22, and the one authorized Photoroom sandbox run completed with exactly 29 calls and zero retries.

The automated binary geometry metrics accepted all 20 clean masks and rejected all 9 negative cases. Visual inspection then found the documented repeated diagonal Photoroom sandbox watermark in every saved mask. Phase 1H-A therefore records a **sandbox/provider-quality failure**, not a mask-quality pass: the free run proves the endpoint, response format, latency, uncertainty, evaluator plumbing, and rejection evidence, but zero returned masks are eligible for deterministic vectorization.

Tim subsequently selected remove.bg for a separate free-preview follow-up. That authorized run made exactly 29 calls with zero retries and $0 cost, accepted 20/20 clean masks, rejected all 9 unsafe cases, and passed mandatory visual inspection of all 26 returned masks. The final Phase 1H-A provider-quality decision is therefore **pass with remove.bg**, while the Photoroom sandbox result remains failed historical evidence. Phase 1H-B remains separate and unauthorized.

Tim's “Perfect.” response to the Phase 1G dog follow-up is recorded as acceptance of those images as **creative-only source material**. It does not approve their three-pole structure, any generated geometry, another OpenAI call, this provider benchmark, or Phase 1H silhouette conversion.

## Architecture and boundary

```text
repository-local procedural fixture definitions
  -> deterministic 480 x 480 PNG inputs + exact ground-truth masks
  -> manifest with hashes, dimensions, rights basis, and expected outcome
  -> local mode: evaluate ground truth; zero external calls
  -> separately approved live mode: one Photoroom alpha-mask call per fixture
  -> deterministic PNG decode + threshold + connected-component analysis
  -> coverage / leakage / clipping / uncertainty / IoU decision
  -> credential-free JSON evidence and optional returned mask files
```

All Phase 1H-A code lives under `tools/phase-1h` plus one evaluation test. It is not imported by `src/app`, does not create an API route, does not alter browser storage, and cannot create product geometry or revisions.

No Python, PyTorch, model checkpoint, GPU service, Docker service, SDK dependency, database migration, user interface, contour tracing, vectorization, or product-family code was added.

## Objective definition of a usable mask

The evaluator thresholds an 8-bit provider mask at 128 and records:

- total and significant connected components using 8-neighbour connectivity;
- foreground fraction and largest-component size;
- ground-truth subject coverage;
- output pixels outside the known subject as background leakage;
- intersection over union (IoU);
- foreground pixels touching the canvas edge as obvious clipping;
- the provider uncertainty header;
- a final `safeToPassIntoDeterministicVectorization` boolean.

A clean mask is usable only if all of these hold after one attempt:

- foreground covers at least 1% and at most 80% of the canvas;
- exactly one significant component exists (a significant component is at least 0.2% of canvas pixels);
- subject coverage is at least 90%;
- background leakage is no more than 5%;
- intersection over union is at least 85%;
- no foreground pixel touches the canvas border;
- Photoroom uncertainty is present, non-negative, and below 0.6.

The thresholds intentionally prefer an explicit rejection over a plausible but unsafe silhouette. Empty cases fail on missing foreground/coverage. Multi-subject cases fail on component count or missing coverage. The badly occluded fixtures split the visible subject with a wide occluder: preserving fragments fails component count; inventing a connection across the occluder fails leakage/IoU.

The provider passes the technical benchmark only when at least 16 of 20 clean fixtures are usable and all nine negative fixtures are rejected. Human privacy, cost, and latency acceptance remains a separate gate.

## Fixture policy

`benchmark-manifest.json` enumerates exactly 29 fixtures:

- 20 clean: ten generated animals and ten generated objects;
- 3 empty;
- 3 multi-subject;
- 3 badly occluded.

Every input and ground-truth mask is generated deterministically from repository code. No image was scraped or copied from a user, provider, stock site, or third party.

## Reproduction without paid or external calls

```bash
pnpm fixtures:phase1h
pnpm benchmark:phase1h:local
pnpm vitest run tests/evals/subject-mask-benchmark.test.ts
```

`benchmark:phase1h:local` verifies every input and ground-truth SHA-256 hash before evaluation and writes `local-validation.json`. Its evidence must say `providerCallsMade: 0` and must never be represented as live-provider quality.

## Authorized live command and observed result

The command was run once only after Tim copied the exact approval sentence, the approval was durably recorded in `live-benchmark-authorization.json`, and the sandbox key was provided to the process without being printed or persisted. `live-benchmark-authorization.template.json` remains deliberately invalid and cannot unlock the harness.

```bash
PHASE_1H_LIVE_APPROVED=true \
PHOTOROOM_API_KEY='<server-only key>' \
pnpm benchmark:phase1h:live -- \
  --approved-provider=photoroom \
  --approved-calls=29 \
  --approved-max-cost-usd=0.58 \
  --approved-privacy=synthetic-only-no-api-training-retention-unspecified
```

The harness performs one request per fixture, in manifest order, with a 30-second timeout and no retry. It writes returned mask PNGs plus redacted `live-benchmark-results.json`. It never writes the key, headers, base64, input bytes, or sensitive data to evidence.

Before dispatch, live mode validates the durable authorization record against the exact sentence hash, approver, timestamp, provider, fixture counts, 29-call cap, zero-retry policy, $0.58 cap, latency expectation, upload description, and privacy acceptance. The result records the actual number of dispatched calls rather than inferring it from the fixture count.

Observed sandbox evidence:

- 29 of 29 requests completed with HTTP 200; no retry path ran.
- Automated metrics: 20/20 clean accepted; 3/3 empty, 3/3 multi-subject, and 3/3 badly occluded rejected.
- Latency: 409 ms median, 494 ms p90, and 1,178 ms maximum.
- Billing mode: documented free sandbox; expected provider charge $0.00 under the $0.58 authorization cap.
- Visual audit: all 29 grayscale masks contain the repeated Photoroom watermark. The automated metric gate is retained as plumbing evidence, but the final technical gate is false and `cleanMasksEligibleForVectorization` is zero.
- No additional provider request is authorized. A clean regular-tier rerun or a different free provider requires a new explicit gate.

## Non-goals preserved

Phase 1H-A does not implement vectorization, contours, polygon simplification, validation geometry, profile-wing definitions, four-pole obstacle generation, 2.5D/3D product rendering, immutable generated-product revisions, course placement, storage migration, accounts, persistence, sharing, deployment, commerce, fabrication, safety, or supplier approval. It makes no OpenAI request.

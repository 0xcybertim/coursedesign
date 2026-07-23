# Phase 1H-A completion audit

Date: 2026-07-22  
Overall status: **complete as a bounded sandbox benchmark; provider-quality gate failed**

This is the historical Photoroom sandbox audit. The later separately authorized remove.bg benchmark passed and is authoritative for the final Phase 1H-A decision; see `REMOVE_BG_COMPLETION_AUDIT.md`.

The exact approved run completed once. The automated geometry score passed, but mandatory visual inspection exposed the repeated sandbox watermark and overruled the unsafe pass. Phase 1H-B remains unstarted and unauthorized.

| Requirement                                     | Status              | Authoritative evidence                                                                                                                                                             |
| ----------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current primary-source provider research        | Proven              | `PROVIDER_COMPARISON.md` compares mask suitability, operation, retention/privacy, latency, cost, JavaScript integration, and rejection support.                                    |
| Exact approval before external requests         | Proven              | `live-benchmark-authorization.json` records Tim's exact sentence, timestamp, sentence hash, fixture contract, privacy acceptance, zero retries, and cost cap without a credential. |
| Exactly 20 clean plus 9 negative fixtures       | Proven              | `benchmark-manifest.json` contains 20 clean, 3 empty, 3 multi-subject, and 3 badly occluded inputs with deterministic hashes and rights evidence.                                  |
| Exact call and retry contract                   | Proven              | `live-benchmark-results.json` records exactly 29 provider calls, 29 completed outcomes, and `maxRetries: 0`.                                                                       |
| Clean automated metric gate                     | Passed mechanically | 20/20 clean outputs passed the predeclared binary coverage, leakage, intersection-over-union, clipping, component, and uncertainty rules.                                          |
| Negative automated metric gate                  | Passed mechanically | All 3 empty, 3 multi-subject, and 3 badly occluded outputs were rejected.                                                                                                          |
| Human-visible mask suitability                  | **Failed**          | All 29 saved grayscale masks contain repeated diagonal Photoroom sandbox watermarks. Zero masks are eligible for deterministic vectorization.                                      |
| Latency evidence                                | Proven              | Median 409 ms, p90 494 ms, maximum 1,178 ms.                                                                                                                                       |
| Cost boundary                                   | Proven              | Sandbox billing mode records expected provider cost $0.00 under the approved $0.58 cap.                                                                                            |
| Credential-free evidence                        | Proven              | Repository search finds no supplied key or key value; evidence stores no request headers or credential.                                                                            |
| No silhouette conversion/product implementation | Proven              | No contours, vectorization, geometry, revision, course, UI/API product integration, migration, commerce, fabrication, safety, or supplier approval was added.                      |

## Final decision

The bounded Photoroom run is finished, but its sandbox output does not pass the clean-mask provider-quality gate. The free run is useful integration and evaluator evidence only. The later remove.bg result is recorded separately; Phase 1H-B still must not begin without separate approval.

The Photoroom 29-call authorization is consumed. Tim separately approved and completed the remove.bg free-preview follow-up on 2026-07-22; it passed the final provider-quality gate. No additional provider call or vectorization work is authorized by either completed run.

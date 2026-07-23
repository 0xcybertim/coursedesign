# Phase 1H-A remove.bg completion audit

Date: 2026-07-22  
Overall status: **complete; provider-quality gate passed**

| Requirement                                  | Status | Evidence                                                                                                                                                                                                         |
| -------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact user approval before external requests | Passed | `remove-bg-live-benchmark-authorization.json` records the exact sentence, hash, timestamp, provider, fixtures, privacy acceptance, zero retries, $0 cap, and visual-inspection requirement without a credential. |
| Finite fixture and call contract             | Passed | `benchmark-manifest.json` contains 20 clean plus 9 negative fixtures; live evidence records exactly 29 calls.                                                                                                    |
| Zero retries                                 | Passed | Live evidence records `maxRetries: 0`; one attempt exists per fixture.                                                                                                                                           |
| Free-preview cost boundary                   | Passed | All 26 successful responses report zero credits charged; maximum authorized and estimated cost are $0.                                                                                                           |
| Clean automated quality                      | Passed | 20/20 clean masks passed coverage, leakage, intersection-over-union, component, and clipping thresholds.                                                                                                         |
| Unsafe-case rejection                        | Passed | 3 empty inputs received HTTP 400; 3 multi-subject and 3 badly occluded masks failed declared geometry checks.                                                                                                    |
| Mandatory visual inspection                  | Passed | All 26 returned masks inspected; 20 clean masks had no visible watermark, halo, hole, clipping, or extra subject; all returned negatives visibly showed rejection conditions.                                    |
| Artifact integrity                           | Passed | 26 returned-mask SHA-256 hashes match the credential-free evidence; no mismatch exists.                                                                                                                          |
| Latency evidence                             | Passed | 521 ms median, 1,201 ms p90, and 3,114 ms maximum.                                                                                                                                                               |
| No product/conversion implementation         | Passed | No vectorization, geometry, revision, course, interface, account, deployment, commerce, fabrication, safety, or supplier work began.                                                                             |

## Final boundary

Phase 1H-A is complete. remove.bg is the selected subject-mask provider for a future, separately approved Phase 1H-B experiment. The current pass does not authorize further API calls or any silhouette conversion. Deterministic obstacle geometry remains authoritative.

# Phase 1H-A remove.bg benchmark report

Date: 2026-07-22  
Provider: remove.bg free-preview API  
Final status: **provider-quality gate passed**

## Bounded execution

Tim supplied the exact approval before dispatch. The run uploaded only the 29 deterministic 480 x 480 PNG fixtures, made one request per fixture in manifest order, made zero retries, and incurred an observed and authorized maximum charge of $0. The API key remained process-only and is absent from repository evidence.

## Automated evidence

- Provider calls: 29.
- Completed PNG responses: 26 with HTTP 200 and `X-Credits-Charged: 0`.
- Explicit empty-scene rejection: 3 with HTTP 400; no invented mask was saved.
- Clean masks accepted: 20/20.
- Negative cases rejected: 9/9 — 3 empty, 3 multi-subject, and 3 badly occluded.
- Clean minimum subject coverage: 99.84%.
- Clean maximum background leakage: 0.0023%.
- Clean minimum intersection over union: 99.84%.
- Clean maximum significant components: 1.
- Clean maximum border foreground pixels: 0.
- Latency: 521 ms median, 1,201 ms p90, 3,114 ms maximum.

## Mandatory visual inspection

All 26 returned masks were inspected at their original 480 x 480 resolution and their hashes were rechecked against the evidence file.

- All 20 clean masks were crisp and free of visible watermarks, halos, holes, clipping, or additional subjects.
- All 3 multi-subject masks visibly retained multiple separated subjects and were correctly rejected.
- All 3 badly occluded masks visibly included the occluding bridge/touching-border failure and were correctly rejected.
- All 3 empty fixtures produced explicit HTTP 400 rejection instead of an invented silhouette.
- Returned-mask hash mismatches: 0.

## Decision and boundary

remove.bg passes the Phase 1H-A subject-mask provider-quality gate on this synthetic corpus. This proves only that the provider can supply a trustworthy raster mask to a separately approved deterministic-vectorization experiment. It does not prove performance on future user photos or Phase 1G concept art, does not make the mask authoritative product geometry, and does not approve Phase 1H-B automatically.

No contour tracing, polygon simplification, shape validation, profile-wing generation, product revision, course integration, application route, account feature, deployment, commerce, fabrication, safety, or supplier claim was implemented.

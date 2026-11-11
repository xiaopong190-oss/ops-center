# V1.0.66.a online shared query

The online display previously fetched and stored an entire encrypted GitHub snapshot in each browser. A failed replacement could leave different colleagues with different authorized cached snapshots. V1.0.65.b blocked stale queries but still required the whole download.

V1.0.66.a serves authenticated, bounded pages from a single active server projection. A cold comparison page requests 50 warehouse rows and 50 regional rows plus filter metadata. It opens no business IndexedDB and writes no quote cache. Two readers retain independent filters and pagination. Each response and export is pinned to its source SHA, projection and Shanghai business date; a switch produces 409 and one fresh query, with old rows cleared. Explicit CSV export alone reads all matching pages and stops without a file if the version changes.

The GitHub publication workflow computes projections using the existing shared normalization, retention, comparison, price/strict grading, score events, tax, cargo and regional coverage modules. It prepares both today and tomorrow. Encrypted immutable parts use a private D1 records namespace. All listed hashes and the current GitHub source are verified before an atomic active-pointer update. A publication receipt requires the matching active query projection. An hourly workflow checks source, relations and day coverage, rebuilding only when necessary. Expired failed projections are reclaimed by the existing daily cleanup. Canonical source records are never modified by query generation or cleanup.

Online warehouse search, monthly bills and controlled cooperation ratings use the same service; cooperation edits retain their existing permissions and revision checks. Local input and local queries continue through the existing runtime. The original CSV quote format and evidence fields remain importable. No locked source hashes are refreshed. The optional column type hints affect only the new page's current-page sorting.

## Validation

- All 465 core rule and lock tests passed.
- New isolated tests use the real encrypted query service with SQLite, not mocked quote pages: concurrent readers, bounded pages, exact source/grade/score equivalence with the old full page, stale source/incomplete activation rejection, tomorrow view, failed-generation cleanup, query failure clearing, monthly summary and export interruption.
- All 66 deployment regression suites passed with isolated data. Final targeted reruns also cover the added fixed OIDC audit routes, schedule identity, empty scores, query decoding cache and CSV/evidence preservation.
- These are local automated results. Authenticated production latency and live browser behavior still need release verification; no live performance claim is made here.

## Authorized release procedure

This is a substantial architecture change. Obtain approval on the tested PR before merging or deploying, as required by `tools/logistics-rating/AGENTS.md` clause 4.

1. Deploy the reviewed Worker with `ONLINE_QUERY_ENABLED=prepare`, preserving existing secrets. This enables building projections without requiring old publisher jobs to have them before their receipts.
2. Merge the reviewed PR, then run `publish-logistics-snapshot.yml` on main with ticket `query-rebuild`. The existing main-only, hosted-runner OIDC gate applies. Only derived encrypted query records are written by this ticket; GitHub canonical snapshot is read-only.
3. Verify the workflow's exact source SHA, both Shanghai days and counts. The signed, read-only `query-read` path runs the same query handler to check concurrent first-page equality, the air filter and first-response byte size. Logs contain aggregates only. Repeat `query-rebuild` and require the already-verified result. Do not expose the new display before this succeeds; cancel the automatic Pages deployment if backfill fails.
4. Set `ONLINE_QUERY_ENABLED=1` and verify the Worker deployment. Complete the Pages release; verify the online entry is V1.0.66.a and local entry is V1.0.66.
5. Verify two independent authenticated readers against the active version, air/provider filters, version-pinned pagination and explicit export. Confirm the network reads query pages rather than snapshot parts. If an actual network path is slow, measure that path before claiming a speed improvement.

## Rollback

Restore the previous Pages release and previous Worker deployment/config together. Keep current GitHub canonical data, D1 accounts and cooperation records. New query records are derived and isolated under `_logistics-online-query:v1:`. Disable/remove the hourly rebuild schedule when reverting the workflow. The old source-snapshot APIs remain available to the previous clients. No canonical-data migration or recovery is needed.

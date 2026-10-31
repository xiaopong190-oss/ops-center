# Immutable display source and record updates — release review

The display currently validates its downloaded snapshot cache against mutable working records. Original modules can canonicalize/prune those records after startup. Reopening can therefore invalidate that cache even when the published source has not changed. This is a reproduced code-path failure with a persisted cache fixture; the user's browser storage was not directly inspected.

v1.0.33 stores the original downloaded source in a separate IndexedDB database, partitioned by session fingerprint, with its full content hash and root version. Working-data preparation never writes into this source. On reopen the client first performs authenticated version lookup, validates the original source, restores the current display projection locally, and skips download. Concurrent refresh clicks share a single in-flight load. If a new root SHA contains the same content hash, the client only reads metadata and the small manifest.

For a new publication, the existing free GitHub Actions runner reads the prior encrypted snapshot through bounded, run-bound authenticated requests. It generates a record-delta-v1 payload from the *same validated display projection* used for the full publication. Unchanged record values are omitted; changed/new values and the ordered hash directory encode the target state, including deletion and duplicates/order. The delta is separately gzip-compressed, encrypted, read back and verified before the same atomic root publication. Its descriptor contains the exact baseline content hash. The Worker handles a bounded part per call and never builds the whole delta in memory. No plaintext is written into the GitHub checkout, artifacts, cache or logs.

Clients whose immutable source matches that baseline download only the delta, apply it locally, verify the complete reconstructed target hash, then replace working data and commit the new immutable source. Failed downloads, record/target hashes, storage writes and changed sessions cannot announce success or discard the prior source. The local relay accepts the additional fixed delta parameter only on the existing authenticated snapshot endpoint.

Compatibility and limits:

- Existing full snapshots and old clients remain readable. The runner still publishes a complete encrypted snapshot for initial installation and recovery.
- First installation, a new session fingerprint, missing/corrupt local source, an old publication without a delta, or a baseline other than the immediately preceding publication requires a full download. This implementation does not claim a multi-version delta chain.
- If the delta directory plus changed records is larger than a full snapshot, the publisher omits it and clients use the full snapshot.
- An already-published legacy root cannot gain a delta without a new normal publication. Upgrading the display alone cannot retrofit the old root. The first v1.0.33 cache establishment may therefore require one full download.
- The record directory is transferred with each delta; the promise is to omit unchanged record *values*, not zero metadata traffic. Snapshot publication computation and upload remain weekly operations on free Actions; this change targets display downloads.
- Login/version checks remain required. A revoked account cannot use the cached source as a substitute for authorization.

Validation includes persistent real IndexedDB emulation across page instances, modified working data, account separation, simultaneous refresh, republished identical content, additions/modifications/deletions, corrupt record/whole hashes and failed durable commit. An actual encrypted publisher/Worker/readback simulation with 1,200 baseline records transfers two added/changed values: 82,491 delta bytes versus about 1.34 MB full, with one deletion and origin-policy exclusion applied. The existing 305-part, 31,113/4,091/571 publication regression remains intact. All business rule fingerprints remain unchanged.

Release remains pending explicit review. Rollback deploys prior clients/publisher/cloud together; full schema-v2 snapshots remain compatible, and immutable local source databases need not be deleted. No original Excel, input master, rating/scoring rule, account permissions or paid plan changes.

## Additional scope — local preview first

User requested adding CBM pricing and further location exclusions to this same PR before reviewing a local build. Reuse the existing `origin-exclusions.js` decision path: any 深圳 string anywhere in the same quote remains the highest-priority keep override. Otherwise exclude explicit CBM/cubic-metre pricing units (including CNY/cbm and normalized m³) and quote strings containing 常州、上海、金华、义乌、华东. A kg-priced dimensional conversion note mentioning cbm alone is not a CBM price. Ningbo/Xiamen origin handling remains the existing logic. There is one shared text traversal and one existing decision/projection module, with no parallel filter implementation. Each exclusion retains the original source row/reason under the same audit retention.

A read-only complete cleaning run over the original 35-sheet model produced 9,639 accepted-before-policy records: 4,463 retained, 5,176 excluded. All 4,063 records containing 深圳 were retained; no excluded record contained 深圳. Independently compared 1,986 generated rows against city price headers and record/unit evidence. Original model stayed unchanged. 59 combined preview tests passed (scope, cleaning Worker, snapshot caching, cloud projection); the final six scope tests passed after the report label was generalized to 运营范围.

Two local preview bundles use port 4333 and SkipUpdate to avoid replacing them with the currently online 1.0.32 package. Their browser origin is separate from the production local 4318 workspace. Actual running preview health/version and served policy were checked. The user requested local review before release tests/online publication; main-branch merge is therefore deferred because it automatically deploys Pages. No production publication or merge has occurred for this added scope.

Release approval: after viewing the local preview, the user explicitly requested online release on 2026-10-30. Final checks are being completed before merge; release uses the existing Free plan. Earlier pending-review statements describe the preparation stages, not a new requirement for approval.


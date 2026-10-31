# Display cache reuse and interruption recovery — release review

## Evidence and limits

The user reported a second full 77-batch download after a prior completed load. The currently served port4333 snapshot client, source-cache module and overview script list were checked against the v1.0.33 source: all matched and included immutable source caching. An initial UI read later showed no current login. Further browser inspection was disabled by Work settings, so the affected browser's IndexedDB and exact miss reason were not inspected. Do not claim a confirmed diagnosis of that specific cache entry or treat an incomplete prior download as established: the user explicitly said it had completed.

Two reproducible gaps remain in v1.0.33: the durable source is keyed by the login-token fingerprint, so a new valid token for the same person cannot reuse it; and individual verified batches exist only in memory until all batches complete, so an interrupted iframe/page starts downloading again. This repair addresses both without replacing the original projection/business modules.

## Behavior

Authenticated metadata now includes an opaque cache scope derived from the existing validated account identity and auth class. Every open still authenticates against the current server/session before any source-cache lookup. Renewing a token for that same verified account no longer changes its source-cache key. Different accounts or auth classes remain isolated, and absent/revoked sessions cannot use cached data instead of authorization. Upload task fingerprints remain token-bound and unchanged.

A complete legacy token-bound source migrates to the account key only after fresh authorization of that same token. If the token has already changed before the upgrade, old token-only records have no trustworthy account attribution, so they are not silently reassigned: one initial cache establishment may still be required. Missing/corrupt/cleared data or a different browser origin (4333/4318/online) also requires its own source. These are distinct stores, not proof that a prior store was reusable.

Each downloaded batch is length/hash validated and saved under scope plus content hash before moving to the next batch. Reopened pages reuse verified saved batches and fetch only missing/corrupt ones. The parts cache is a separate IndexedDB database, keeping the old source database's v1 schema intact for old pages/rollback. It is capped at128 parts (at most64MiB via the existing validated512KiB reader); committed source batches are removed after the complete source commit. A cleanup failure does not invalidate an already-committed source and remains subject to the count cap. An interrupted or failed source commit retains saved batches and the previous full source.

Progress states explain whether a full source is missing/new, then report the actual local-reused and newly-downloaded batch counts. Completed same-version loads report local reuse with no quotation download. Record-delta publication/application and CBM/location/Shenzhen policies stay unchanged.

The original browser adapters also used mutually exclusive CommonJS/global exports. A host exposing `module` could receive no `WorkspaceDisplayCache` or `WorkspaceDelta` browser interface, silently triggering fallback. Both adapters now retain their browser interface as well as the unchanged CommonJS export. Production pages fail before a full download if either required adapter is absent, rather than silently treating that as a cache miss. This compatibility path is reproduced in the actual-startup VM, but the affected live browser's globals could not be inspected, so it is not asserted as that screenshot's proven cause.

## Verification

Tests cover completed source + working normalization + same-person relogin, distinct account/auth scope, revoked login before cache lookup, legacy source migration, interrupted load and resume across new store/page instances, part corruption verification, bounded stored part count and cleanup after source commit. Production startup scripts are also replayed together in a VM with IndexedDB emulation: local-bootstrap, large-cache, original validators, source cache and snapshot client. A three-batch initial load followed by relogin+reopen makes one metadata request; an interrupted first batch survives and the next page fetches only batches1 and2. This is a startup-path replay, not a claim of live-browser inspection.

Release is pending explicit approval. Deploy the additive metadata field and client together; old clients ignore it and new clients fall back to token keys against an old server. No new login permission, account edit, paid service, business-data write, encryption change, quote reimport or new full publication is necessary. Rollback preserves the v1 source schema and can leave the bounded parts database unused.

# Free weekly snapshot publication

The observed blocker is Cloudflare Free CPU termination during whole-snapshot reconstruction, not the weekly upload frequency. The account remains Free. No CPU-limit override or paid subscription is required.

## Resulting flow

The input continues uploading the same authenticated 128 KiB chunks. Commit claims one background task using a D1 compare-and-swap and dispatches the repository's standard Ubuntu GitHub Actions runner. Existing v1.0.26–v1.0.28 clients already understand pending progress, so the frozen task can continue without reimporting or replacing the local package. Each pending poll waits four seconds outside CPU execution.

The runner downloads one decrypted original chunk per Worker call, verifies every chunk and the complete original transport hash, reconstructs frozen legacy deltas against their original baseline, and applies the original full business validator and display projection in Node. Whole-file parsing, validation, gzip and hashing no longer run inside the Free Worker commit request.

For each 512 KiB display part, the runner gzip-compresses locally. The Worker only seals the compressed bytes and retains a small verification proof. The runner creates a GitHub blob, downloads that exact blob, and asks the Worker to decrypt and verify it against the proof. All parts must pass before a single non-forced branch compare-and-swap makes the manifest and encrypted files visible together. Competing root changes stop publication; unrelated branch changes may be retried. A lost branch-update response is resolved by reading the root. The old root remains active until every encrypted batch has passed readback.

The existing schemaVersion 2 encrypted manifest is used. Display pages, warehouse grouping, transport classification, quote retention, scoring, templates, local namespaces, keys and original encrypted data remain unchanged. A verified root receipt must match the original frozen transport hash before the input reports success.

## Trust and privacy

The encryption key remains in the existing Worker. No key or new long-lived secret is copied into GitHub Actions. Runner access requires a signed GitHub OIDC token pinned to immutable owner/repository IDs, main ref, the exact publication workflow, hosted runners, dispatch event, audience, expiry and one bound run ID. Public task IDs grant no access by themselves. Fork, PR and other-workflow tokens are rejected.

Plaintext exists only in the trusted runner's memory and bounded HTTPS responses. The script does not save it to the checkout, caches, logs, artifacts or repository. Only ciphertext blobs and the encrypted-part manifest are committed. Service errors logged by the workflow are fixed codes, not quote values or request tokens. Expired task mappings and verification proofs are cleaned with the existing daily cleanup.

The repo is public. Standard GitHub-hosted Actions runners are free for public repositories: https://docs.github.com/en/actions/concepts/billing-and-usage . This workflow uses ubuntu-latest, not a larger paid runner, and has a 15-minute timeout. No scheduled weekly run is necessary: the user publishes when that week's data is ready.

## Validation and operational checks

Synthetic exact 39,973,361-byte / 305-part transport, 31,113 warehouse + 4,091 regional rows + 571 templates: one dispatch under concurrent commits, one atomic root change, byte-identical complete display reconstruction. This fixture's largest compressed Worker request was 9,374 bytes. Separate production self-test exercises OIDC and a 512 KiB high-entropy encryption roundtrip without accessing business tasks. Node fixtures do not prove production Free CPU behavior; production self-test and real-task completion are recorded separately after deployment.

Also covered: old frozen deltas, invalid data, corrupt ciphertext, premature manifest readiness, wrong run identity, incorrect OIDC signatures/issuer claims and lost branch-update response. Full legacy upload/shard suites remain required. The Worker dry-run must build without paid limits. Complete release regression result is recorded in the PR.

Deploy the workflow to main and then deploy the Worker with WORKSPACE_COMMIT_RUNNER=github-actions. Run the signed synthetic self-test before resuming the user's original pending task. Require a verified receipt and published root/count verification before claiming the real upload completed.

Rollback: remove WORKSPACE_COMMIT_RUNNER or set it to legacy and redeploy; no stored data is migrated. The legacy 40 MiB CPU blocker would remain until a working compute path is restored. Keep the task and original browser data. A page-side pause stops waiting; an already dispatched background publication continues and its verified receipt can be collected on return.

# Import undo and publication cancellation

User request: 2026-11-16, both undo the latest import and cancel a stalled publication.

## User flow

The import workspace exposes **撤销最近一次导入**. It previews the checkpoint time and before/after warehouse and regional counts before confirmation. An independent IndexedDB checkpoint is written and read back before the quotation database is changed. It contains the complete before and after quote databases: quotations, templates, exceptions, carry decisions and pending batches. The supplier directory is deliberately retained; bills, ratings, credentials and cloud data are untouched.

Rollback requires the current data to match the imported after-image. Only the existing automatic quality-archive projection is normalized for that comparison; later manual edits block rollback. Publication receipts and independently queried local/cloud jobs are checked. Active jobs must be resolved/cancelled first, and a new successful/archived publication prevents a local-only rollback. The publication lock is acquired before the business lock during undo. Both images survive recovery attempts; an interrupted undo that already restored the before-image can finalize without overwriting it again.

The publication preview/failure dialog exposes **取消本次发布并返回录入**. It pauses foreground waiting, then requires a verified cancellation response. The desktop controller cancels through the cloud coordinator, including a pre-receipt tombstone when no local package exists, and retains its encrypted recovery package. It refuses in-flight local synchronization or committed cloud work. Browser continuation state is cleared only after verification; network/authorization/conflict failures keep it. Refreshing and clearing an old continuation cannot bypass cancellation. A successful result remains visible after ordinary status refreshes.

## Boundaries and rollout

Old imports without a before-image cannot be reconstructed automatically. The control explains that a pre-import backup is required; it does not delete a supplier or invent old prices. Already committed cloud work requires a new reviewed correction batch, not a fictitious rollback.

The implementation depends on the UTF-8 reception fix in PR #129. No production quotation has been uploaded/cancelled/restored by development tests. Deployment and changes to an existing installation remain separate release steps.

Only three explicit `import-undo-*-approved` integration seams were added to the original import click handler. The recovery module belongs to the workspace; without it, legacy default import behavior remains available. Lock normalization removes exactly those seams; baseline hashes were not changed. A preview changed while the checkpoint is being saved aborts the import.

Rollback of this feature must remove the workspace module wiring and all three seams together. Preserve IndexedDB checkpoints, the encrypted outbox and existing task receipts. Do not treat removing application code as undoing already published business data.

## Validation

- 468 locked core tests; historical lock checks unchanged.
- Source-backed DOM tests for both controls and visible errors, plus actual runtime import replacement and IndexedDB restoration.
- Deterministic tests reject later edits, changed receipts, missing checkpoints and failed writes; verified cancellation is required before clearing browser state.
- Isolated Chrome: synthetic regional quote replacement, actual confirmation click, undo to the old price, cancel back to input; external network blocked.
- Full regression and remote CI are recorded separately in the release review; passing a targeted check alone does not authorize rollout.

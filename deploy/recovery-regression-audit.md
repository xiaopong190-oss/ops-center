# Recovery regression audit — 2026-11-16

Scope: stop incremental live patches, consolidate recovery fixes and run the complete regression before another release. No production deployment, local running-install update or real quotation mutation is part of this audit.

Reproduced defects and fixes:

1. Publishing after a new import could preview the old first queued supplier. The workspace now requests explicit batch selection before any upload. Supplier, source dates and counts are visible. Selecting a later batch does not reorder or delete earlier ones. Frozen tasks cannot be silently switched to another supplier.
2. Date-exception recovery changed the local quote database but created no supplier publication batch, so the old supplier remained the only publishable queued item. Recovered rows now generate the proper pending scope, including previously valid rows of the recovered provider/type so subsequent batch replacement cannot discard them.
3. Date-only recheck must still honor Amazon warehouse scope and configured origin exclusions. Regression fixtures ensure recheck cannot bypass them; invalid dates, manual decisions and price conflicts remain unchanged.
4. Import checkpoints must not be applied by another login session. New checkpoints bind to a non-secret session fingerprint; older unbound checkpoints explain the limit instead of claiming another user owns them. Previously saved checkpoint images remain in IndexedDB history instead of being overwritten by the next checkpoint.
5. Repreview after a verified cancellation must not inspect a deleted progress record and block the user again. Reliable cancellation proceeds to a new preview only after the tombstone acknowledgement; legacy/failure paths keep the original task.

Validation includes locked core tests, whole repository regression, real isolated Chrome input/undo/cancel/recheck/select-publish journeys, fresh-install payload generation and independent resource hashes. The exact passing suites and logs are recorded in the final audit report. The existing retention, comparison/scoring and source-date rules are unchanged.

Limits: synthetic regression and isolated browser operation do not establish the outcome of the user's legacy 1224-row batch. That actual batch remains untouched. A legacy import without a pre-import checkpoint cannot be reconstructed by new code. A committed cloud task cannot be labelled cancelled. These are explicit boundaries, not states to hide by clearing a warning.

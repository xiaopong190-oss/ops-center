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

Follow-up functional input audit: the user clarified that clicking Confirm Import appeared to do nothing. Real Chrome keyboard/file tests exercise XLSX upload, supplier/date/notes editing, actual cleaning and save, undo followed by reimport, publication-preview cancellation followed by editing, file-preview cancellation followed by reselection, and invalid CSV followed by valid CSV. Synthetic checkpoint failures are visible and retryable. This does not reproduce the exact historical user file or account state.

The input audit found missing feedback during asynchronous pre-save recovery work and a fixed 250ms dirty-state timer that could clear an unfinished/failed import or temporarily block undo after success. A named workspace-only presentation controller now shows progress immediately, suppresses duplicate clicks, reports the original success/error, and clears the dirty flag only after a successful import result. Four focused tests cover delayed completion, duplicate clicks, repeated identical failures with retry, failure-state retention past the timer boundary, and read-only exclusion. Frozen quotation handlers and validation rules are unchanged. The new focused suite is included in the repository regression runner (87 suites after this follow-up).

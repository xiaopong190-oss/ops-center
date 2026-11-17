# Publication latency investigation — 2026-11-17

User symptom: cloud quotation publication takes too long. No production task, quotation or credential was modified during this investigation.

Read-only production evidence: recent repository-dispatch publication runs 44060742279, 44058907113, 44056155401 and 44034060804 succeeded in about 8–10 minutes. The latest run began within seconds; its application step took 10:00:25–10:08:20 UTC. Existing logs have no sub-stage timings, so they establish backend time, not a precise attribution of every minute to indexing or networking. A specific affected user's local transfer stage remains unconfirmed.

Source trace: local durable outbox -> Worker upload admission -> GitHub runner -> full scoped merge -> ciphertext write/readback -> atomic root commit -> query-index staging/activation -> exact query-page readback/checkpoints -> immutable success receipt. GitNexus tools were unavailable; this trace is verified against source at 3732a76 and the changed branch, not a graph index.

The runner staged independent immutable index batches serially, then read every query page serially. New work is bounded at four concurrent requests. Readback pages remain ordered before hashing. Checkpoint writes remain serial and occur only after a complete read window drains, preserving the existing lease fence. Activation follows all successful stage writes; any failure drains in-flight work and prevents activation. GitHub writes, root compare-and-swap, ciphertext verification, original dates, confirmation ordering and final success requirements remain unchanged.

Transient HTTP 408/429 responses retain the same task/version and retry within the existing attempt limits, honoring numeric Retry-After up to 60 seconds. Permanent validation/permission failures still stop. Tests cover rate-limited index requests and a rate-limited runner request without a duplicate business commit.

Stage-only timing records contain a fixed stage name and elapsed milliseconds, never supplier names, task IDs, rows, prices or credentials. They distinguish prepare, query preflight, sealing/storage, Git commit, index build, exact readback and receipt for future real runs.

Synthetic benchmark: 1224 quotations, fixed 40ms simulated request latency, identical manifest and content proof. Index build: serial 3784ms, bounded parallel 1926ms (55 requests both). Exact readback: serial 3543ms, bounded parallel 2811ms (30 reads both); serial durable checkpoints are retained. These are synthetic measurements, not a promise about production completion time.

Focused regression covers task/lease races, 1000 control-plane fault sequences, checkpoint restart, permission/cancellation, corrupted and out-of-order readback, drained failures and one business commit. The new suite is part of the full regression entrypoint. Production deployment is separate from this candidate fix; the measured production 8–10 minute runs predate it.

Rollback: revert the bounded-parallel and timing commits together. No stored-data migration, credential or Worker deployment is required by this change. Existing accepted tasks and encrypted parts remain valid.

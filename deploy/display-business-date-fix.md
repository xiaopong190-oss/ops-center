# Display business date correction — V1.0.65.a

The authenticated GET-only audit run 42775744002 verified snapshot
998036bcc87e56d3cfbec71d0c397ac68e937695 without changing it. Its warehouse
quotes include Tian Sheng dated November 9 (410 rows) and five providers
dated November 10 (6,593 rows). The published carry decision is `skip` for
the week starting November 9. At 2026-11-10T07:30Z, Los Angeles is still
November 9, while Shanghai is November 10. The old reader therefore selected
only Tian Sheng; the Shanghai selection includes six providers and 7,003 rows.
The colleague's older screenshot also reports a newer snapshot available:
its 4,240 rows are not the expected count for this latest snapshot.

The publisher already uses `Asia/Shanghai` in
`deploy/publish-logistics-snapshot.mjs`. Previously the display used the
reader's local day. The user explicitly confirmed aligning the display with
Shanghai and continuing tests on November 9, 2026 (Los Angeles date).

`extensions/display-business-date.js` accepts an explicit instant and audience
and returns a Shanghai date only for display consumers. A single marked
integration seam in `quotes.js` supplies that date for quote eligibility,
week windows, retention projection, comparisons and exports. Regional queries,
carry status and initial mapping presentation use the same read-only date.
Input audiences keep the original local-day fallback. No Date replacement,
export monkey patch, stored quote date edits, cloud data writes, forced carry
choice, new retention rule or score formula change is included.

The historical lock hashes remain unchanged: the lock test removes only the
reviewed integration prefix and reconstructs the previous source. The manifest
adds the consent record rather than replacing a baseline fingerprint.

Validation covers the six audited provider/date counts, future exclusions,
week/year boundaries, daylight-saving dates, read-only data invariance,
provider/reset interaction, and complete-page runs in Los Angeles and Shanghai.
The core suite has 465 passing tests. Browser-control connections time out;
complete-page tests use the project's DOM runtime and do not claim a live
authenticated browser verification.

Rollback reverts the PR, including the clock extension, marked seam, generated
runtime assets, version labels and consent/lock-test additions. Business data
needs no rollback or migration. Production release follows AGENTS.md review
and explicit user release authorization.

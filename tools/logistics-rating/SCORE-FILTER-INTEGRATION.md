# Approved global score view integration

The user explicitly agreed (2026-10-24) to a separate high-score list, default high-to-low, retaining the original country/warehouse grouped view. PR19 now implements that view, without merging or deploying it.

## Independent functions

extensions/score-filter.js exports scoreView, createScoreListController and renderScoreList. scoreView receives the full existing ranked result after existing provider/country/warehouse filters, applies inclusive min/max0–10, sorts by channelScore and then paginates200 rows. Equal scores retain input order; unknown scores stay last and never become zero. It does not calculate score or change scoring peer sets. A separate flat table retains country/warehouse, original evidence and operational event buttons. Score controls reset page only, preserving scoring confirmation.

## Explicitly approved hook and lock update

quotes.js adds a controller variable and a post-ranking presentation branch. Existing rankRows/compareRows/grouped implementations, import handlers, delete handlers and scoring formula remain unchanged. New view sets rankedVisible to all matching rows so both existing exports include the full score-filtered sequence, not just the current page. Original grouped mode bypasses the projection and keeps original exports. Score filtering intentionally does not change deletion scope, stated on screen.

Only quotes.js's hash was refreshed under the user's explicit approval, recorded in default-rule-lock.json; the other eleven locked module hashes are unchanged. n001.html adds a dedicated controls host and script load before quotes.js. To roll back, remove that hook and script entry and restore the previous quotes.js baseline hash.

## Validation and boundaries

317 tests pass: min/max, ties, fractional scores, unknown/zero, highest score originally beyond row400 reaching page1, empty/reset, original mode, real page wiring,205-row pagination, full206-line CSV export including header, provider filter, scoring-confirmation preservation, original evidence/operations actions, escaping and storage unchanged. Default core lock checks pass. No user business data writes.

Existing compare-button requirement for a specific country/warehouse and async relation invalidation are untouched; global score display before active comparison shows baseline/manual adjustments only and explicitly explains this. This does not claim cross-warehouse prices are comparable. PR17 remains the base dependency. PR18 is a separate grouped-pagination explanation and is not included here. No production merge/deployment authorization is inferred from approval of the display change.

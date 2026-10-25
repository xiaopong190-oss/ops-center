# Default rule lock and conflict inventory

Baseline: deployed beta.79, commit 950a86b. This PR adds safeguards only. It does not correct an unconfirmed screenshot defect or change runtime behavior. The lock means preserve current behavior pending an explicit change decision; it does not certify that all current rules are correct.

## Protected defaults

Twelve shared modules are hashed in default-rule-lock.json. The full test suite checks normalized source hashes. CRLF/LF differences alone do not fail the check. Code changes fail with the affected filenames. Updating the baseline is an explicit rule-change operation, not a routine release step. CI cannot verify human consent by itself; the PR must record that consent.

Amazon-only scope; equal-condition dedup and new-over-old; ten-day retention for quotations and evidence; permanent warehouse templates automatically saved from imports; preserved raw evidence and manual score history; unit, country, warehouse, cargo and tier boundaries.

## Conflicts that require a decision

1. **All warehouses versus compare button:** N001UI's current click handler requires both country and warehouse. The screenshot has country=美国, warehouse=全部仓库. Clicking compare would stop at the warehouse requirement. This is an existing gate, not proof of a beta.79 regression. Allowing all warehouses is a proposed rule change: group internally by warehouse rather than comparing warehouses together. Do not implement until confirmed.
2. **Comparable group count versus channel score:** groupCount is an old multi-provider statistic, excluding comparisonIssue rows; it does not count new same-provider alternatives or necessarily the normalized groups used by the newer scoring projection. A value of zero is not proof of zero usable quotes. Proposed separate function: comparison diagnostics that labels multi-provider grade groups and same-provider scored alternatives separately. Existing counter remains unchanged until approved.
3. **Async associations invalidate scoring:** logistics-relations-ready currently clears confirmed state. If a user has already scored and a later AI batch arrives, the UI can return to baseline. Screenshot alone cannot confirm this occurred. A proposed extension could preserve intent and explicitly recalculate after a relation revision, without mixing old/new results; this needs a separate change decision.
4. **beta.79 replaced compare in place:** same-provider interval scoring was implemented inside channel-score.js. This contradicts the new requested development boundary. No silent rollback is included: current beta.79 stays frozen. Any extraction into an independent extension must have a dedicated PR with output-equivalence tests and an explicit choice of default behavior.

## Extension contract

New rules use named pure functions/modules in extensions/. Inputs specify rows, event snapshot and rule version; outputs include scores, reasons and rule version without writing storage. No export replacement or prototype monkey patching. Integrating an extension into a default call chain is itself a reviewed change. Import/storage identities remain under original locked modules. Default regression and extension regression must both pass.

## Screenshot investigation limit

Only the screenshots and deployed source were available. No live user local-storage snapshot was read. We cannot yet state that quotes vanished, warehouses changed, or the new score failed. Await the user's exact failing operation before choosing a behavior change.

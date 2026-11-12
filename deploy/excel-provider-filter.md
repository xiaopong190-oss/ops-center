# V1.0.66.c provider header filter

The previous header menu deliberately extracted distinct labels from the current 50 DOM rows. A page occupied by one supplier therefore offered only that supplier, even when later pages contained other suppliers. Its selection and sorting changed only the visible page, and exports followed separate global filters.

The user requested all providers and an Excel-style interaction. The online provider header now receives distinct provider labels and counts from the already-loaded encrypted server index, within the current global conditions and score range. It excludes its own column selection when building choices, allowing users to change an existing selection. It does not download later quote pages to build this list. Providers with no matching quotes are excluded, except a selected provider that becomes unavailable is shown with zero so it can be cleared.

The menu supports search, select all with an indeterminate state, clearing checkboxes, multiple selection, confirmation/cancel, clearing the column filter, and ascending/descending provider sorting. Search plus confirmation applies matching checked items. Empty checkbox selection disables confirmation, as in Excel. Cancel and opening/searching the menu send no quote request. Clicking outside, Escape, parent-workspace interaction and scrolling close it. The menu fits within the visible iframe and viewport.

Interaction references: [Microsoft AutoFilter](https://support.microsoft.com/en-us/excel/use-autofilter-to-filter-your-data) and [clearing a column filter](https://support.microsoft.com/en-us/excel/clear-or-remove-a-filter). This implements the provider menu's common search/checkbox/sort workflow; it is not a general Excel engine.

Selection and ordering are sent as dedicated query parameters, intersected with existing global filters. Results, pagination and CSV export use them across the complete matching dataset; version pinning and failed-query clearing remain enforced. The regional quote table retains its own scope. Other existing header columns are unchanged. The top reset clears the provider column too. A response capability check prevents the new UI from treating an older Worker that ignores these parameters as a successful filtered result.

No locked module, quote identity, import, retention, grade/score formula, canonical data, index format, or encryption changes. The existing indexes support the new read operation without a data migration or full-snapshot client download. Local input remains V1.0.66; the online display is V1.0.66.c.

## Verification

An isolated 600-row, three-provider fixture has only one provider on page 1. The actual server returns all three choices, each with 200 rows. UI tests verify off-page selection, multi-select, no changes on cancel, search/Enter, indeterminate select all, cross-page ordering, intersecting global filters, recovery from no matches, independent users and full filtered CSV export. The signed production audit is extended to verify full choice counts, an off-page provider, multi-provider selection, pagination and provider ordering without logging quote records.

Actual Chrome checks use synthetic data and the real encrypted query handler in desktop, embedded workspaces and a 390px viewport. They verify complete choices, search, pagination, popup bounds and outside-click dismissal. All 465 rule/lock tests, all 66 full regression suites, and the final 46 targeted UI/update tests passed. The final audit test run also covers the expanded provider-selection and sorting smoke checks.

## Release and rollback

After approval of the concrete PR, deploy the reviewed Worker first; old V1.0.66.b clients ignore the extra response metadata. Record its actual version in `release.json`, then merge the reviewed frontend changes. Run the main-only signed `query-rebuild` audit and require the expanded read checks before allowing the Pages release to finish. If checks fail, cancel Pages and restore Worker `0f0ce484-4726-41f4-a015-d85392af1c95`. Restore frontend tag `hangxu-v1.0.66.b` if needed. Preserve current canonical data, sessions, cooperation records and derived indexes.

Approved backend deployment: `0ce42d8e-ac1c-457d-834e-a6e387bc0fb0`, from reviewed source `3391b8ca6424cea969dad2a56d9606e3ce6134ba`, tagged `hangxu-v1.0.66.c-worker`. Static Worker assets were unchanged. The previous production Worker remains the rollback target above. Live query verification follows the main-branch merge.

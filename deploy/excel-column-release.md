# V1.0.66.d: complete quotation column filters

V1.0.66.c filters only the provider column against the full server result. Other headers still filtered DOM rows on the current page. This release replaces those handlers for all twelve warehouse quotation columns, preserving the existing top filter arrangement and server pagination.

Headers use the requested blue background and small white square dropdowns. Every menu supports search, select all, clear, confirm, cancel and typed sorting. Multiple columns intersect; each menu enumerates the full subset permitted by other columns and global controls, excluding its own selection. Null time/score/grade values sort last. Exports retain the same filters, order and immutable query version.

The trusted publisher adds encrypted per-column ordinal indexes to the derived read model. Value dictionaries are paged at 200 entries/24 KB; a facet request reads at most four value dictionary parts. Searching continues through metadata pages, including values absent from the current quotation page. No full snapshot or business browser cache is added. Long criteria use authenticated, read-only form POSTs bounded to 256 KB. Legacy provider query parameters remain supported for V1.0.66.c clients.

Ordinal selections are bound to the active query version and grade context. A publication switch resets selections before querying the new version; a comparison/context change clears grade and score selections. The new client requires full-column capability, and query readiness now requires table schema 1. Canonical quotes, shared scoring rules, input package V1.0.66, storage and lock hashes are unchanged.

## Validation

- 465 core rule and lock tests passed.
- Encrypted SQLite integration tests cover all columns, combinations, self-excluded facets, typed ordering, 2,100-value dictionaries, metadata search, invalid/version/context criteria and legacy compatibility.
- Page tests cover all twelve header command sets, main controls, cancellation/Escape/outside click, more options, search-confirm across 1,400 values, large read-only POST criteria, two independent readers, pinned pagination/export and publication interruption.
- Actual isolated Chrome checks passed on desktop, 390 px mobile and the tool-center iframe: all twelve white square controls, blue headers, complete provider choices, off-page selection, filtered next page, menu bounds and parent-click dismissal. Test data is synthetic.
- Worker bundle dry run, whitespace check, all 67 deployment regression suites and the final 12 page integration cases passed.

## Approved-release sequence

Obtain approval on the concrete PR under `tools/logistics-rating/AGENTS.md` clause 4. Deploy the reviewed Worker first; retain V1.0.66.c frontend compatibility. Record its actual version and source in release metadata. Merge the reviewed PR and run the existing main-only `query-rebuild` workflow. Require schema-1 readiness and signed audit of all twelve facets, selections and sorting before completing Pages publication; cancel/hold Pages if backfill fails. Verify the published frontend version, asset hashes, active source and authenticated query/CORS behavior.

Rollback frontend to `hangxu-v1.0.66.c` and Worker to `0ce42d8e-ac1c-457d-834e-a6e387bc0fb0` together if necessary. Derived column records can remain; they do not change canonical data. Never roll back user quotes or cooperation records.

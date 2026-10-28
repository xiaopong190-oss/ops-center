# v1.0.13 — sheet quote inspection

Local implementation; not pushed or deployed. The exact workbook from the reported screenshot was not provided, so this does not establish that its extracted region counts are incomplete.

The original parser already scans the complete workbook; its raw UI previously displayed only 80 rows. The preview now starts at 200 valid rows and can expand in 200-row increments, with original coordinates preserved. Results separately label warehouse and regional quotations and report the valid rows inspected.

An independent pure `extensions/sheet-quote-audit.js` projection identifies literal price-like rows not covered by extracted warehouse/regional records or rejected-record evidence. It scans all valid rows rather than only the displayed preview. Reference sheets and numeric-only boilerplate are not promoted to base freight quotes. This does not change the locked matrix parser, price admission, retention, company naming, scoring or warehouse rules.

Suspected uncovered rows enter the existing bounded AI review queue even if the rule report says cleaning finished. Context includes more nearby rows and more distant literal headers, within the existing request limits. AI must still return original source-cell mappings, cannot invent prices, and unresolved rows remain unresolved. The existing 400-row queue cap, per-item size limits, identity checks, quotas and strict result validation remain. Already extracted regional quotes are not treated as missing merely because the warehouse quote count is zero.

Per-sheet details expose the scanned row count, last original row, extracted warehouse/region counts and available AI classifications. The downloadable cleaning evidence includes the sheet audit and AI decisions. Unavailable or failed AI is not represented as confirmed extraction. The local server now relays only authenticated same-origin quote-cleaning requests to the fixed existing AI endpoint so the local CSP does not silently block this review.

Validation used synthetic cells and mocked AI responses: 398 business tests and 31 full-stack regression suites passed, with focused reruns for the final UI and relay changes. Tests include a header at original row 190 and a quote at row 300, an already extracted regional record, reference-only/numeric-only rows, actual invocation of the mocked AI review queue, read-only audit projection, worker output equivalence apart from audit metadata, and local AI relay permission/origin/purpose restrictions. No real workbook was transmitted to AI and no production data was changed.

Rollback removes the sheet-audit imports/projection, additional review-queue candidates/context and intake display hooks, and the local AI relay. Existing quotes and manual decisions require no data migration.

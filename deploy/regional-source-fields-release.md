# V1.0.67 local cleaning: preserve source field ownership

The supplied three-sheet workbook reproduced 27 generated regional rows, but a generic tier-column context selected an origin region as the channel. Tax detection missed the separate channel cell and defaulted to excluded tax. Regional extraction retained time prose but did not populate structured transit ranges. Standard admission then isolated 18 rows as conflicting prices because two distinct sea services had become the same channel. The generation preview did not show that later admission result.

`extensions/regional-source-fields.js` is a pure post-extraction projection for regional rows with a single explicit “下单渠道” marker. It reads adjacent channel values or channel cells owned by an explicit merged range. It retains source channel/header coordinates, explicit tax evidence, and the source time value/header. Origin, weight tier, geography, currency, date, price and raw notes are preserved. Unknown/optional/conflicting tax stays unknown. Ambiguous or missing channel values become preserved regional rejections. Compensation periods do not become transit ranges; days and flight/departure/next-day pickup bases remain distinct. Time ambiguity remains empty with original evidence retained. Unrelated and parallel-group layouts retain their existing adapters.

The existing Worker wrapper runs the projection; the existing UI runs it again after optional AI review so an AI result cannot overwrite explicit source fields. Preview admission calls the existing, unchanged `QuoteCore.partitionRegional` with the same local current date as standard admission, reporting generated, accepted and pending regional counts and reasons before forwarding. The download includes source-field and admission audits. No import, identity, retention, scoring or storage rule is relaxed. Frozen functions and lock hashes are unchanged.

Local package becomes V1.0.67 so restart/auto-update recognizes this input fix. Public display remains V1.0.66.e, and the deployed query Worker is unchanged. Reimport and final save remain explicit user actions; this release does not rewrite stored quotes, clear pending evidence or repair earlier imports automatically.

## Verification

The original workbook was read through the actual XLSX reader and two-stage cleaning Worker in an isolated runtime. All 27 price cells were checked against the original; 9 air and 18 sea rows retain separate channels and explicit tax. All 27 now pass the unchanged admission partition with zero conflicts. Date, region/postal exclusions and tiers are retained. Source images and notes remain in the full audit package.

Actual isolated Chrome read the original file through the file input, confirmed the supplier, cleaned, and forwarded to standard validation. Preview and admission both reported 27 accepted and zero pending; the three source channels were present. Final save was not clicked and the isolated database remained empty. The browser screenshot and detailed original-file proof stay outside the repository; no business workbook or prices are committed.

Synthetic regression tests cover the 27-cell matrix, exact price/region evidence, merged channel/time ownership, excluded tax, missing/optional/contradictory tax, missing channel rejection, compensation and competing-time rejection, untouched unrelated/parallel layouts, idempotence, actual Worker integration and preview/standard date consistency. Core locks and full deployment regression are release gates.

All 465 core tests and 68 full regression suites passed. Final focused integration passed 112 tests, including the seven source-field/admission cases and portable update replacement/recovery. The reviewed complete candidate has 125 verified application resources and no workbook, user quote data or account. The candidate ZIP SHA-256 is `26a0889fe814095b2d79a1ba0491b5b7ce6f79c572450b606ebd30a2f59ff12d` (35,975,478 bytes).

## Release and rollback

This changes cleaning behavior, so obtain approval on the concrete tested PR under `tools/logistics-rating/AGENTS.md` clause 4. No frozen integration hook was changed. Publish the input update assets after approval, verify the V1.0.67 manifest and immutable payloads, and deliver a complete local ZIP. No query Worker deploy or source-data/index rebuild is required.

Rollback input assets/package to V1.0.66 while retaining all local/remote business data. Remove the extension imports and UI audit integration together if reverting source. Do not delete quotes, pending evidence or source files. The existing standard admission conflict gate remains active throughout.

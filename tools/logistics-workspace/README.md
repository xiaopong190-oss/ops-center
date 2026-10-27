# Logistics workspace

Input: `input.html`. Display: `display.html`.

For the local preview, run `node tools/logistics-workspace/dev-server.cjs` from the repository root and open `http://127.0.0.1:4318/input`. It serves this exact release source and original shared modules, rather than the earlier simplified prototype. It preserves the same origin and input storage namespace. The preview blocks external network requests; authenticated snapshot publishing and remote AI require the hosted operational page.

The input keeps business data in this browser's localStorage / IndexedDB. It loads shared business modules directly from `../logistics-rating`; `node build.cjs` regenerates wrappers and the source hash manifest. Protected defaults remain locked except for the explicitly documented user-approved seams and performance exception.

In v1.0.3, “按原因批量处理导入资料” separates reference/enquiry archival from missing-country prices. Open the preview, paste or fill a verified warehouse-country table, acknowledge the filled countries, then preview and explicitly save. Blank countries remain pending. Archival retains the original exception text, coordinates and decision history. Existing automated country errors can be included only by opting into historical correction; conflicting manual confirmations and warehouse edits remain protected and must first be resolved in the original warehouse editor. A zero regional-price-conflict count never means all exception types are complete. Newly cleaned workbooks classify proven reference rows separately and flag explicit country contradictions; their accepted quotation count can consequently differ from earlier defective parsing.

The display has no input navigation. A signed-in ops-center account is required to retrieve the snapshot. Full input publishes only after preview and explicit confirmation. Companies, quotes, warehouses, mappings, bills and completed cooperation ratings are included. Pending import evidence and deleted quotes stay local.

The Worker `/api/logistics-workspace` encrypts the snapshot with AES-256-GCM using existing `ENCRYPTION_KEY` and a distinct AAD. GitHub stores only ciphertext in `data/logistics/workspace-snapshot.enc.json`. Configure `LOGISTICS_GITHUB_TOKEN` as a Worker secret with contents write permission limited to the ops-center repository. Never embed it in frontend code. The original `shared.json` transport is unchanged. Existing account sessions control read access; only accounts with edit permission can publish.

The display stores a separate local cache. Refresh needs authentication and reloads the latest published version. It never replaces the input master. Publishing checks GitHub SHA, uses an operation ID for retry, and requires a real GitHub commit receipt. Download a local backup before moving computers or clearing browser storage.

Tests: `node --test ../logistics-rating/tests/*.test.cjs`, `node --test *.test.cjs`, and `node --test ../../cloud/test-logistics-workspace.mjs`. Use repository QA dependencies for DOM tests. Repository fixtures are synthetic; authorized real-file acceptance tests remain local and do not modify the user browser storage or publish business data.

Rollback: revert this feature commit and redeploy the Worker and Pages. Leave the old UI and its data intact. Do not remove the encryption key while encrypted snapshots are needed.

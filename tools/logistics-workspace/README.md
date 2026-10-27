# Logistics workspace

Input: `input.html`. Display: `display.html`.

The input keeps business data in this browser's localStorage / IndexedDB. It loads 40 business modules directly from `../logistics-rating`; `node build.cjs` regenerates wrappers and the source hash manifest. No locked business module is changed.

The display has no input navigation. A signed-in ops-center account is required to retrieve the snapshot. Full input publishes only after preview and explicit confirmation. Companies, quotes, warehouses, mappings, bills and completed cooperation ratings are included. Pending import evidence and deleted quotes stay local.

The Worker `/api/logistics-workspace` encrypts the snapshot with AES-256-GCM using existing `ENCRYPTION_KEY` and a distinct AAD. GitHub stores only ciphertext in `data/logistics/workspace-snapshot.enc.json`. Configure `LOGISTICS_GITHUB_TOKEN` as a Worker secret with contents write permission limited to the ops-center repository. Never embed it in frontend code. The original `shared.json` transport is unchanged. Existing account sessions control read access; only accounts with edit permission can publish.

The display stores a separate local cache. Refresh needs authentication and reloads the latest published version. It never replaces the input master. Publishing checks GitHub SHA, uses an operation ID for retry, and requires a real GitHub commit receipt. Download a local backup before moving computers or clearing browser storage.

Tests: original 376 core tests; `node --test snapshot.test.cjs runtime.test.cjs`; `node --test ../../cloud/test-logistics-workspace.mjs`. Use repository QA dependencies for DOM tests. No production data is used by tests.

Rollback: revert this feature commit and redeploy the Worker and Pages. Leave the old UI and its data intact. Do not remove the encryption key while encrypted snapshots are needed.

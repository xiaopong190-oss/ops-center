# Explicit Ningbo / Xiamen origin exclusion — release review

Requested behavior: hide warehouse and regional quotes explicitly originating in Ningbo or Xiamen in every logistics workspace display, and omit them from subsequent cleaning/admission/publication.

User refinement: if any string value anywhere in the same quote record contains 深圳, retain that quote before evaluating any origin exclusion. This includes company, source filename, source notes, nested evidence, and negative phrases containing 深圳. It does not inherit unrelated cells from the whole workbook. Thus even an explicit Ningbo/Xiamen origin is retained when the quote also mentions 深圳.

## Before and after

| Evidence | Result |
|---|---|
| originCity=宁波 / originPort=Xiamen | Exclude |
| 起运港：厦门 / 宁波起运 / 厦门始发 / Origin: Ningbo | Exclude |
| City price-column evidence preserved as 起运/服务=宁波 or 起运/服务=厦门 | Exclude |
| 工作表“美国海运 宁波起运” with no stronger row origin | Exclude |
| Structured originCity=深圳, sheet mentions 宁波起运 | Keep: explicit row origin wins |
| 宁波/深圳起运 | Keep: mixed allowed/excluded origins are not unambiguous |
| 非宁波起运 / 不从厦门起运 / 宁波起运除外 | Keep |
| 宁波物流公司 / filename 厦门物流报价 / destination 宁波 | Keep |
| 宁波交货价 / 厦门交仓价 only | Keep: receiving location alone is not proof of origin |

The pure module is tools/logistics-rating/extensions/origin-exclusions.js. No locked business function or fingerprint changed. The non-locked workbook-worker entry applies a pure result projection and retains source coordinates/reasons in cleaning reports. The workspace quality adapter moves already-saved excluded rows into a local originExcludedQuotes audit, preserving the full original row and the existing ten-day cutoff. Templates, company directory, bills, ratings and score events remain untouched.

Both local and web display paths use the same projection when loading a snapshot, including existing published snapshots. It applies to warehouse and regional rows. The local exclusion audit is removed from publication. The cloud/Actions display projection enforces the rule for old upload clients as well. Frozen-task previews and post-publication scope checks compare the same effective projection, avoiding a false difference just from this policy. Input and display should both update to v1.0.31 so local cleaning and counts use the same policy.

## Verification

Dedicated tests cover affirmative/negative evidence, mixed origins, structured row priority, source notes and coordinates, immutable projections, local audit retention/idempotency, old-client cloud publication enforcement, existing-snapshot client load, and the actual two-stage workbook cleaning Worker. Original rule-lock suite passed all 431 tests. Full workspace and release results are recorded in the PR after completion. No real quote was removed or republished while preparing this change.

Read-only verification with the original 35-sheet sea-workbook model ran the full two-stage cleaning Worker: 9,639 accepted rows before this policy, 2,281 origin exclusions, 7,358 retained. An independent check matched 1,986 generated quotes against original city price-column headers and merged-cell spans in 美西专线 and 英国不包税, with an independent serialized-record Shenzhen check taking priority. All 4,063 records containing 深圳 were retained; zero excluded records contained 深圳. This retains 386 more rows than the prior policy. The source model remained unchanged. This check also exposed and fixed the initially missing 起运/服务 marker; it is covered by regression tests. These counts describe this source workbook, not the published snapshot. Ambiguous origins remain visible pending human confirmation.

## Deployment and rollback

Separate PR; release is pending review under tools/logistics-rating/AGENTS.md. Deploy matching v1.0.31 input/display assets and cloud projection after approval. Existing snapshot data need not be reuploaded just to hide these origins in the updated display; future publications physically omit excluded active rows from the new encrypted snapshot. GitHub history is not purged.

Rollback removes this extension and its workspace/worker/cloud integration, restoring the previous visibility projection. Local original rows remain in the ten-day exclusion audit or source/backup; restoration must use normal validation and deduplication rather than blindly reinserting stale rows. No changes to encryption, free Actions publishing, cache namespaces or account permissions.

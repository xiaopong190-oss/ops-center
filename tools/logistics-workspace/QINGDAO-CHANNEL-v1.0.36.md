# Qingdao channel exclusion

Add 青岛 to the existing geography decision only when it appears in the actual channel (`channel` or standard import channel column `values[2]`). Reuse the same region result, cleaning projection, display projection and cloud publication projection; there is no new independent filter.

Priority is unchanged from v1.0.35: CBM/cubic-metre pricing is always excluded, even for a Shenzhen channel. For non-CBM pricing, a channel containing 深圳 retains the quotation; otherwise a channel containing 青岛 is excluded. Shenzhen in company/file/note fields does not exempt a Qingdao channel. Qingdao in those non-channel fields alone does not activate this newly requested rule. Other existing geographical rules, retention, deduplication, scoring, source evidence and cache/incremental logic remain unchanged.

Tests cover standard import channel columns, company/filename/notes, mixed Qingdao/Shenzhen channels, CBM conflicts and all cleaning/display/cloud projections. Source-workbook QA uses a read-only full cleaning run and independently checks source headers, unit and channel evidence. No source workbook or production snapshot is republished for this preparation.

The full35-sheet QA model produced9,639 accepted records before the policy:1,582 retained and8,057 excluded. Qingdao-channel records without a Shenzhen channel had zero retained and920 excluded (including records already excluded for CBM pricing). All1,582 non-CBM Shenzhen-channel records remained; no CBM record remained.1,986 generated rows were independently matched to source headers/unit/channel evidence and the original model was unchanged. These are source QA counts, not online snapshot counts.

Release is prepared separately for review. Existing snapshots need no reupload to apply the new client projection; subsequent cleaning/publication uses the same pure policy. Rollback removes only Qingdao channel matching and restores the prior version assets. Original excluded rows remain in the existing audit under the original retention rule.

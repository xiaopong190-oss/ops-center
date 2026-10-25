# Country filter shows four warehouses: presentation scope

The screenshot reports 美国244个仓库 and 12677 quotations on page 1/64. Default grouped() slices a global 200-quotation page before rendering warehouse sections. Hence only the warehouses touched by the first 200 rows appear. This is different from filtering down to four warehouses. Counts in the screenshot are consistent with this mechanism, but the user-local quote payload has not been read independently.

This PR adds extensions/warehouse-page-clarity.js with three independent named functions: describeWarehousePage, readWarehousePage and mountWarehousePageClarity. It reads the already-rendered country warehouse totals, current row/warehouse nodes and pagination caption. It inserts an adjacent explanatory note and delegates navigation to the existing warehouse selector. It does not calculate another filtered dataset or change default rendering functions. Source DOM, quotation data, filters, grades, scores and pagination remain untouched.

n001.html adds one script-load entry. None of the twelve locked shared files are modified and the lock manifest stays unchanged. This is an additive display hook, not a change to the default engine call chain. Rollback removes that entry. A complete warehouse directory or warehouse-based pagination would be a separate proposed change, not silently introduced here.

Tests cover the screenshot's 4/244, 200/12677 and 1/64 figures; single-warehouse multipage; empty results; rerender updates; reuse of existing picker; separate loading; and default hash protection. Depends on the default-rule-lock PR. No merge/deployment included.

Independent default-engine reproduction uses synthetic 553 quotes across 244 warehouses: after country=美国, original storage retains553, page caption reports553, country summary244, rendered sections4 and rendered rows200. The reproduction does not modify storage and is included as a permanent regression test. Full suite:315 passing tests.

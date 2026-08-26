---
name: growth-playbook-budget
description: >-
  Maintains the Amazon growth-playbook step-09 ad/Vine/manual-review budget
  calculator (tools/growth-playbook). Use when changing 推品计划, 广告预算表, Vine
  入组费, 手动测评, 单件毛利, 不用垫信用卡, 开始赢利, MAX/SUM 满载, or budget-math.cjs.
---

# Growth playbook budget

Canonical file for formulas: `tools/growth-playbook/budget-math.cjs`.  
UI glue: `tools/growth-playbook/index.html`.  
Regression: `node tools/growth-playbook/budget-math.test.cjs`.

Do not duplicate the math in `index.html`. After any formula change, run the test file and keep the UI strings in sync with the same numbers.

## What it calculates

Ads (Excel 广告预算模板): week spend = scaled keyword orders × ad-share × CPA.  
CPA = CPC × (100 / CVR%). Ad-share = `adEnd + (adStart - adEnd) * exp(-k * weekIndex0)`.  
Empty keyword rows and empty weeks are ignored. A half-filled keyword row blocks the whole ad result.

Vine is **not** the Amazon fee alone:

- Fee: qty 1–2 → $0; 3–10 → $75; 11–30 → $200; qty 0 or invalid → no Vine line.
- Goods: qty × (product cost + first-mile + FBA). Missing cost pieces count as 0, never NaN.
- Total Vine = fee + goods.

Manual reviews: qty × (product cost + first-mile + per-unit commission). No FBA. Qty without commission fails validation (0 commission is allowed).

Header:

- 不用垫信用卡 = first week where **that week’s** unit margin × orders ≥ that week’s ads (does not wait for Vine).
- 开始赢利 = first week where **cumulative** margin ≥ cumulative ads **+ Vine + manual**.

MAX vs SUM: both still cost **every complete keyword**. MAX uses max(SPR×7) as listing full-load; SUM adds them. Default MAX for one listing.

## Boundaries to preserve

- Vine qty integer 0–30 only. 31 must not bill 31 units (treat as 0 + validation error).
- Non-integers (2.4) are invalid, not rounded into another fee tier.
- Negative cost/head/fba/commission are clamped to 0 in extras; ads still require ≥ 0.
- CVR must be (0, 100]; 0 and >100 are incomplete keywords.
- Top bar 售价 syncs into 产品单价 only when the user edits 售价, not on every budget keystroke.

## Do not

- Show Vine as $75/$200 without the giveaway goods.
- Treat MAX as “only one keyword”.
- Fold Vine into 不用垫信用卡.
- Copy formulas back into `index.html`.

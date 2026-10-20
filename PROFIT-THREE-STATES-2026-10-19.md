# Profit analysis three-state UI

Adapted the supplied reference into responsive, theme-aware live cards: structural shortfall, advertising overspend, and target achieved. All values use shared formulas; no mock figures are stored. Preserves the original profit waterfall and latest-period actual-price binding. Missing costs or advertising data remain explicitly incomplete; losses are shown directly.

Validation: 23 new state, boundary, missing-data, rapid-input and isolation cases; all 12 regression suites passed. Vite production and browser Babel builds passed. Layout structure checked using JSDOM; no pixel-level browser inspection claimed. No business data or shared-store test writes.

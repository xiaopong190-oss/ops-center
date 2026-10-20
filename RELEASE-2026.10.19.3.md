# v2026.10.19.3

Added editable trial advertising spend, sales units, advertising orders and return rate beside unit costs. Upper analysis and waterfall use these same values and trial price/costs/goal. Unset fields display selected-period references; explicitly cleared fields remain unknown (return rate explicitly previews zero). Overrides save as separate link economics fields without changing period records. Lower analysis remains bound to latest actual period and does not rerender for trial-only edits. Counts require nonnegative bounded integers, percentages 0-100, and spend uses the existing monetary typo guard. Advertising orders above trial units are rejected.

Validation: all 12 isolated regression suites passed, including 27 state and trial-binding cases, 40 live-input cases, 28 linked-analysis cases and 44 latest-period cases. Production Vite and browser Babel builds passed. No real business data written.

# Logistics default rules — user-required change boundary

The human user explicitly requires default logistics logic to remain locked. This applies to all files under this directory, and supersedes earlier convenience workflows that edited and deployed directly to main.

1. Read `default-rule-lock.json` and `DEFAULT-RULES.md` before changes. The locked baseline is the deployed beta.79, not a claim that beta.79 is defect-free.
2. Preserve Amazon-only scope, equal-condition dedup/new-over-old, 10-day quote retention, permanent automatically saved warehouse templates, import validation, default comparison and saved manual events.
3. Add each new behavior as a separate named function/module under `extensions/`. Do not replace a locked function, monkey-patch its export, or silently change a shared default. An extension takes input explicitly and returns a new projection; no global/storage writes.
4. Prepare a separate branch/PR. Do not push changes to main, merge, or deploy unless the user explicitly authorizes that release after reviewing the concrete result.
5. If a requested feature conflicts with default rules or needs an integration hook in a locked file, document the old rule, proposed behavior, affected callers, rollback and tests. Obtain user direction before changing that rule. Do not silently update the lock manifest to make tests pass.
6. Run `node --test tests/*.test.cjs`, including lock and behavior tests. Test changes to source, not user business data. A passing test suite alone does not establish a screenshot's cause.

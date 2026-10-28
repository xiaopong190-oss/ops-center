# v1.0.7 — tax-prefixed warehouse rate layouts

User approval: after diagnosis of 通泽美国专线同行.xlsx, the user requested optimization and deployment on 2026-10-27. The locked matrix parser and admission rules are unchanged. A new pure projection handles strictly matched tax-wrapped tier headers only when the old parser has no supported block, with a nearby warehouse-code header. Channel, delivery origin, tax, raw tier, price coordinates, explicit country/date and separate timing/claim evidence are retained.

Real-file isolated verification: 42 numeric price cells expand across 54 warehouse codes and three tiers into 162 candidates. All 240 source cells and the two reference sheets remain in the full cleaning audit; reference charges are not freight prices. First example: ONT8, 12KG+, 14.70 CNY/kg, 包税, 美森专线卡派, 深圳/广州交货. Regular/extra sailing, reference delivery time and claims remain separate evidence; no single combined promise is invented.

The actual execution date is 2026-09-23. The UI reads it without substituting today. Forwarding these candidates through the original standard intake rejects them as expired; no valid quotations were admitted in the isolated test. Users must obtain/confirm an actually valid quotation date rather than using the parser fix to bypass retention.

Existing real Jiufang regression preserved 9,185 warehouse quotes and 472 regional quotes, including rejected evidence. The extension added about 18 ms in that run. Ordinary-format outputs remain identical. Synthetic tests cover valid tax/tiers, country ambiguity, malformed money, fee exclusion, original date, separate timing evidence, UI expiry and zero-extraction failure wording.

No real workbook or private diagnostic artifact is included in the repository or delivery ZIP. Automated UI tests use JSDOM and Worker threads with isolated storage; live browser visual acceptance is not claimed. Rollback removes the new projection and Worker/intake/AI-reference hooks. Original source files, browser namespace, encryption, score rules and 10-day admission remain unchanged.

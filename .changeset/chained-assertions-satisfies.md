---
"adamantite": minor
---

Report assertion chains through `satisfies` in `antislop/no-chained-type-assertions`

A `satisfies` expression between two assertions, such as `(value as unknown satisfies unknown) as number`, hid the chain from the rule. A `satisfies` expression keeps the type of its operand, so the rule now looks through it as it looks through parentheses.

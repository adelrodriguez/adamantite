---
"adamantite": patch
---

Stop recommending a non-null assertion in the core preset

The core lint preset no longer enables `typescript/non-nullable-type-assertion-style`. The rule reported `value as string` and told the author to write `value!`, which `typescript/no-non-null-assertion` bans. Core still bans the non-null assertion. Suppressions that name `typescript/non-nullable-type-assertion-style` are now unused, so you can delete them.

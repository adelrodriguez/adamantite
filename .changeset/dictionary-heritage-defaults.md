---
"adamantite": minor
---

Report unsafe dictionaries in heritage clauses, alias defaults, and `globalThis.Record`

`anti-slop/no-unsafe-dictionary-type` now reports `interface A extends Record<string, unknown>` and `class A implements Record<string, unknown>`. It reports a type alias or interface whose default type argument makes it an unsafe dictionary, such as `type Bag<T = unknown> = Record<string, T>`, because every plain use of `Bag` gets that default. It also reads `globalThis.Record<string, unknown>` as the built-in `Record`, which Effect code writes when `import { Record } from "effect"` hides the global type.

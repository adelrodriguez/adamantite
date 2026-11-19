---
"adamantite": patch
---

Type the `printWidth` of `adamantite/format` as set

The default export of `adamantite/format` now has the type `FormatConfig & Required<Pick<FormatConfig, "printWidth">>`, so `format.printWidth` reads as a `number` instead of `number | undefined`. A config that spreads the preset or exports it unchanged still type-checks.

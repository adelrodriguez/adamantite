---
"adamantite": minor
---

Add the `antislop` lint preset, a vendored build of [anti-slop](https://github.com/dmmulroy/anti-slop) that rejects low-evidence, low-signal TypeScript and JavaScript patterns. Extend `adamantite/lint/antislop` alongside the core preset, or select it during `adamantite init`; nothing extra needs to be installed. Note that the preset also turns off two core rules that conflict with the anti-slop rules: `typescript/consistent-indexed-object-style` (its autofix produces code that `anti-slop/no-known-value-widening` re-flags) and `unicorn/no-immediate-mutation`. The init preset prompt now also shows a one-line description for every preset.

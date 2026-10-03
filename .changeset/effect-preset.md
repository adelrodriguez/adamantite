---
"adamantite": minor
---

Add the `effect` lint preset with curated [@effect/tsgo](https://github.com/Effect-TS/tsgo) rules for Effect misuse, such as effects that never run and unhandled errors. `@effect/tsgo` is a managed plugin. Its rules exist only in Oxlint binaries that `effect-tsgo patch --oxlint --typescript` patched, so `adamantite init` installs the pinned package, adds the patch as the `prepare` script, runs it once, and adds the `@effect/language-service` entry with `diagnostics: false` to `tsconfig.json`. Doctor reports a missing package, patch step, or tsconfig entry. The analyze preset exports `ignoreDependencies.effect`, which `init` sets and doctor requires while `oxlint.config.ts` imports the preset.

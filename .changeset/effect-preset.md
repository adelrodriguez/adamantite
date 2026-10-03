---
"adamantite": minor
---

Add the `effect` lint preset with curated [@effect/tsgo](https://github.com/Effect-TS/tsgo) rules for Effect misuse, such as effects that never run and unhandled errors. `@effect/tsgo` is a managed plugin. Its rules exist only in Oxlint binaries that `effect-tsgo patch --oxlint --typescript` patched, so `adamantite init` installs the pinned package, runs the patch, sets the `prepare` script to the new `adamantite prepare` command, and adds the `@effect/language-service` entry with `diagnostics: false` to `tsconfig.json`. `adamantite prepare` runs the patch, and `adamantite update` runs it after it installs packages. Doctor reports a missing package, `prepare` step, or tsconfig entry. A production-only install that runs scripts fails at `adamantite prepare`, so use `--ignore-scripts` for those installs. The analyze preset exports `ignoreDependencies.effect`, which `init` sets and doctor requires while `oxlint.config.ts` imports the preset.

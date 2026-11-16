---
"adamantite": minor
---

Ship the custom rule authoring types inside the package, and stop exporting `eslintCompatPlugin`

`adamantite/rules/plugin` now defines `definePlugin` and `defineRule`, which return their argument, and its declarations include the authoring types of the Oxlint version that Adamantite pins. `@oxlint/plugins` is no longer a runtime dependency, and a project type-checks its custom rules without installing it.

`adamantite/rules/plugin` no longer exports `eslintCompatPlugin`, which made a `createOnce` rule run in ESLint. Adamantite runs rules only in Oxlint, which runs `createOnce` rules without it, so remove its calls.

---
"adamantite": minor
---

Stop reporting migrations from earlier Adamantite versions in Doctor

Doctor no longer reports these findings, and no longer reads the source of configs and rule files to find them. A config or rule file that still uses a retired name now fails to load, and Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed. Replace each retired name, and remove the leftover settings by hand:

- "The shadcn preset was renamed to tailwind" (`tailwind-preset-migration`). Replace `adamantite/lint/shadcn` and `--preset shadcn` with `adamantite/lint/tailwind` and `--preset tailwind`.
- "React Doctor rules now belong to react-strict" (`react-doctor-preset-migration`). Replace `adamantite/lint/react-doctor` and `--preset react-doctor` with `adamantite/lint/react-strict` and `--preset react-strict`. Keep the `react` preset and `oxlint-plugin-react-doctor`. The `react-doctor/*` rule names stay the same.
- "The antislop rules now belong to strict" (`strict-preset-migration`). Replace `adamantite/lint/antislop` and `--preset antislop` with `adamantite/lint/strict` and `--preset strict`.
- "Custom rules need migration to the current agent workflow" (`custom-rules-api-migration`) and "Custom rule `<file>` cannot load" (`custom-rule-cannot-load:<file>`). A config or rule file that imports the removed `adamantite/lint/custom` module or a name that `adamantite/rules` no longer exports fails to load, and so does a rule file with TypeScript that type stripping cannot erase, such as an `enum`. Import `custom` from `adamantite/rules`, and `definePlugin`, `defineRule`, and the authoring types from `adamantite/rules/plugin`. The Adamantite skill gives these repairs for the `oxlint-config-load-failure` finding.
- "Legacy oxlint-tsgolint" (`legacy-oxlint-tsgolint`). Remove `oxlint-tsgolint` from `package.json`. Adamantite runs the type-aware rules on tsrs.
- "Legacy Zed oxfmt settings" (`legacy-zed-oxfmt-settings`). Remove the oxfmt language server settings that an earlier Adamantite wrote to `.zed/settings.json`: `configPath: null`, `"fmt.experimental": true`, `typeAware: false`, and `unusedDisableDirectives: false`.

Doctor also no longer looks for rules in `.adamantite/rules`, the default rules folder before `.adamantite/lint`. It checks only `.adamantite/lint` and the folders that `custom()` calls load. Move the rules to `.adamantite/lint`, or load the folder with `custom({ dir: ".adamantite/rules" })`.

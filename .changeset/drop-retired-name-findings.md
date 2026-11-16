---
"adamantite": patch
---

Stop reporting retired preset and rule namespace names in Doctor

Doctor no longer reports these findings:

- "The shadcn preset was renamed to tailwind" (`tailwind-preset-migration`)
- "React Doctor rules now belong to react-strict" (`react-doctor-preset-migration`)
- "The antislop rules now belong to strict" (`strict-preset-migration`)
- "Node rules now belong to core" (`node-preset-migration`)
- "The antislop rule namespaces have changed" (`antislop-rule-migration`)
- "Legacy Zed oxfmt settings" (`legacy-zed-oxfmt-settings`)

A config that still imports a retired preset fails to load, and Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed. A config that sets a rule under a retired namespace also fails to load, with an error such as `Plugin 'anti-slop' not found`. `adamantite check` reports a suppression comment that names a retired rule as an unused directive. Replace each retired name with its replacement:

- `adamantite/lint/shadcn` and `--preset shadcn` become `adamantite/lint/tailwind` and `--preset tailwind`.
- `adamantite/lint/react-doctor` and `--preset react-doctor` become `adamantite/lint/react-strict` and `--preset react-strict`. Keep the `react` preset and `oxlint-plugin-react-doctor`. The `react-doctor/*` rule names stay the same.
- `adamantite/lint/antislop` and `--preset antislop` become `adamantite/lint/strict` and `--preset strict`.
- `adamantite/lint/node` and `--preset node` become the core preset, `adamantite/lint`, which enables the Node rules. Remove the import, its `extends` entry, and `--preset node`.
- The `anti-slop/*` rule namespace becomes `antislop/*`, in rule settings and suppression comments.
- The `anti-slop-effect/*` rule namespace becomes `antislop-effect/*`, in rule settings and suppression comments.

Keep the rule severity, options, and suppression reasons when you rename a rule.

The Zed finding listed oxfmt language server settings that an earlier Adamantite wrote to `.zed/settings.json`: `configPath: null`, `"fmt.experimental": true`, `typeAware: false`, and `unusedDisableDirectives: false`. Remove the ones that remain by hand.

---
"adamantite": minor
---

`adamantite analyze` now runs Sherif before Knip in a detected monorepo, so `analyze` fails on Sherif findings there. Monorepo projects: run `adamantite update` to install Sherif. When Sherif is missing, `analyze` fails and points to `adamantite update`. Outside a monorepo, `analyze` behaves as before.

The new `--only monorepo | unused` flag runs one stage. Without `--fix`, both stages run and the exit code comes from the first failure; with `--fix`, a Sherif failure skips Knip. `--fix` applies to each stage that runs, and `--strict` applies to Knip only. Arguments after `--` go to Knip, or to the stage that `--only` selects, so `adamantite monorepo --fix -- X` equals `adamantite analyze --only monorepo --fix -- X`. `--only monorepo` fails outside a monorepo and with `--strict`. Sherif refuses to fix in a CI environment, so in a monorepo `analyze --fix` fails when `CI` is set; use `--fix` locally, or `analyze --only unused --fix` for the Knip fixes.

The `adamantite/analyze` Knip preset now sets `ignoreDependencies: ["sherif"]` when the root `package.json` declares `sherif`, because Knip cannot see that `adamantite analyze` runs it and reported it as an unused devDependency. A `knip.config.ts` that overrides `ignoreDependencies` must add `"sherif"` itself.

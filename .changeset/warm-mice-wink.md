---
"adamantite": minor
---

Sherif is now a managed package for the `analyze` script in a detected monorepo. `adamantite init --script analyze` installs Sherif there, `adamantite update` installs it in existing monorepo projects, and `adamantite doctor` reports it when it is missing. Doctor also reports a monorepo `knip.config.ts` that does not set `ignoreDependencies: ["sherif"]`, which Knip needs because it cannot see that `adamantite analyze` runs Sherif.

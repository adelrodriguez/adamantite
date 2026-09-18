---
"adamantite": minor
---

The `adamantite/analyze` preset has a new named export, `ignoreDependencies`, which groups suggested Knip ignore lists by the kind of project that needs them. `ignoreDependencies.monorepo` lists the dependencies that Knip must ignore in a monorepo (currently `sherif`). In a detected monorepo, `adamantite init` now writes `ignoreDependencies: ignoreDependencies.monorepo` to the generated `knip.config.ts`, so later additions arrive with the package. Doctor accepts that form and an explicit `"sherif"` entry. The default export does not change.

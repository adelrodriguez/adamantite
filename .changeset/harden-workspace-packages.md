---
"adamantite": minor
---

In a monorepo, the `adamantite harden` prompt lists the Oxlint config and the instruction files of
each workspace package, and the rules folders that their `custom()` calls load. A rules folder that
several configs load through a shared tooling package is listed once. The new `--path` option
limits the session to one package or folder, and fails with a clear message for a folder outside
the project.

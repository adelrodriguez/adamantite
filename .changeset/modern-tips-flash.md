---
"adamantite": minor
---

Add knip preset for dependency analysis

Ships new `adamantite/analyze` preset with opinionated knip rules for detecting unused files, dependencies, and exports. Includes sensible defaults: errors on unused files/dependencies, warnings on unused exports/types, and ignores common build/dist directories.

The init command now installs relevant VS Code extensions based on selected scripts (OXC for lint/fix, Knip for analyze, TypeScript Native Preview for typecheck).

Also updates oxlint core rules to allow tagged templates and ternaries in expressions.

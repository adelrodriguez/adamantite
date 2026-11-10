---
"adamantite": minor
---

Add the `adamantite/import-owners` rule to restrict an import to the files that own it

The rule restricts an import to the files and folders that own it, such as `{ import: "giget", owners: ["src/lib/sources/repository/fetch.ts"] }`, and each
message names the owners. A module covers its subpaths, `names` restricts only some exports, such
as the `react-native` `Alert`, and owner paths are relative to the workspace root, so a monorepo
can name an owner package such as `packages/utils`. An `import` that starts with `#`, `.`, or `/`
names a file or folder of the project, such as `#lib/database.ts`, and the rule resolves each
import to it, so a relative path to the same file counts too. An import of a `#` module as written
also counts, so an alias that a workspace package declares still matches. The `strict` preset
loads the rule, and the project turns it on with its owners.

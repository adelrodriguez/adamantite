---
"adamantite": minor
---

Add the `adamantite/import-owners` rule. It restricts an import to the files and folders that own
it, such as `{ import: "giget", owners: ["src/lib/sources/repository/fetch.ts"] }`, and each
message names the owners. A module covers its subpaths, `names` restricts only some exports, such
as the `react-native` `Alert`, and owner paths are relative to the workspace root, so a monorepo
can name an owner package such as `packages/utils`. The `strict` preset loads the rule, and the
project turns it on with its owners.

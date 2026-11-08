---
"adamantite": minor
---

Add `adamantite/layers` with explicit `imports` lists and nested layer maps. The rule enforces
one-way, transitive imports between the folders of a root. Each layer can contain a child map
in `layers`, with its own settings and a root derived from its containing folder. Declaration
order does not change permissions. Every containing map remains an independent check.

The rule resolves relative imports, `#` imports, and `tsconfig.json` paths. It reports unknown
folders and duplicate concrete scopes. Each violation names the map's concrete root and
declaration path and gives the repairs that its graph permits. The `strict` preset loads
the rule, and the project enables it with its maps.

For the previous array-valued declarations, run `adamantite doctor` and follow its migration
instructions. Replace each dependency array with `{ imports: [...] }`, preserve every dependency
and setting, and nest only existing compatible child scopes. Doctor writes no files. Run
`adamantite check`, verify allowed and forbidden imports, and run Doctor again.

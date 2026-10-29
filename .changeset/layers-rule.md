---
"adamantite": minor
---

Add the `adamantite/layers` rule. It enforces one-way imports between the folders of a root, such
as `src/lib`, from a layer map in the rule options. It resolves each import with
`oxc-resolver`, including `#` imports and `tsconfig.json` `paths`, reports
a folder that is not in the map, and each message gives the repairs that the map allows. The
`strict` preset loads the rule, and the project turns it on with its map.

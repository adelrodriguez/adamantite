---
"adamantite": minor
---

Add the `adamantite/layers` rule to enforce one-way imports between folders

Each layer lists the layers it can import in `imports`, and imports are transitive. Each layer can contain a child map
in `layers`, with its own settings and a root derived from its containing folder. Declaration
order does not change permissions. Every containing map remains an independent check.

The rule resolves relative imports, `#` imports, and `tsconfig.json` paths. It reports unknown
folders and duplicate concrete scopes. Each violation names the map's concrete root and
declaration path and gives the repairs that its graph permits. The `architecture` and `strict`
presets load the plugin, and the project enables the rule with its maps.

---
"adamantite": patch
---

`adamantite rule add` no longer writes an `AGENTS.md` to the rules folder. The authoring guidance lives only in the "Custom rules" section of the Adamantite skill, and `rule add` and the `AGENTS.md` section that `init` writes point to it. An existing `.adamantite/rules/AGENTS.md` stays in place, and you can delete it.

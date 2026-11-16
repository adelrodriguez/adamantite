---
"adamantite": minor
---

Write `oxfmt.config.ts` as a managed file

`adamantite init` and `adamantite update` now write `oxfmt.config.ts` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. A config that an earlier version wrote and nobody changed is replaced with the current version, which lists its imports in the order that Oxfmt sorts them. A config that you changed is kept, and `adamantite doctor` reports it when it no longer uses `adamantite/format`. When the setup no longer runs `check` or `fix`, `update` deletes the config if nobody changed it.

A project with a conflicting `.oxfmtrc.json` or `.oxfmtrc.jsonc` gets no `oxfmt.config.ts`, because Oxfmt loads no config when it finds both, and Doctor reports the `conflicting-oxfmt-config` finding with the migration. Doctor also reports a JSON config beside `oxfmt.config.ts` with that finding, which replaces `shadowed-legacy-oxfmt-config`. `init` no longer prints that it kept a JSON Oxfmt config.

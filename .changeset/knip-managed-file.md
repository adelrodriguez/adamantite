---
"adamantite": minor
---

Write `knip.config.ts` as a managed file

`adamantite init` and `adamantite update` now write `knip.config.ts` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. A config that an earlier version wrote and nobody changed is replaced with the current version, and a config that you changed is kept. `adamantite doctor` reports a kept config that no longer uses `adamantite/analyze` or misses an ignore list that the setup needs. The ignore lists now follow the recorded selection, so a project that selects the `effect` preset gets the `@effect/language-service` entry on the first `init`. When the setup no longer runs `analyze`, `update` deletes the config if nobody changed it.

A project with a conflicting `knip.json` or `knip.jsonc` gets no `knip.config.ts`, because Knip loads the JSON config first, and Doctor reports the `conflicting-knip-config` finding with the migration. The `missing-knip-config` finding now says to run `adamantite update`, and `init` no longer warns about a JSON Knip config beside `knip.config.ts`: Doctor reports it with `conflicting-knip-config`, which replaces `shadowed-legacy-knip-config`.

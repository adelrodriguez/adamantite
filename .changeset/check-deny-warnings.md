---
"adamantite": minor
---

`adamantite check` now fails when Oxlint reports a warning. Pass `--allow-warnings` to keep the old
behavior. A project with warnings, such as reports of the rules that a preset
sets to `warn`, fails `check` after the update. `adamantite harden` now keeps a new rule at `error` and
turns it off in an Oxlint override for the files that break it, in place of a `warn` setting.

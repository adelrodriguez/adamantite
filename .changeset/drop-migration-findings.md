---
"adamantite": minor
---

Drop the migration paths from earlier Adamantite versions, and report a project without a lockfile with one finding that says to run `adamantite init`

A project without `.adamantite/adamantite-lock.json` now gets the `lockfile-missing` finding alone, from `adamantite doctor` and from `adamantite update`, and both exit 1. Its goal is to run `adamantite init`, which sets up the project and writes the lockfile. `update` no longer reads a setup from the project files of a project without a lockfile. Doctor no longer checks the integrations whose files exist in such a project, and no longer prints the "No Adamantite-managed setup found" warning for a project that declares `adamantite` without a setup. Run `adamantite init` once in each project that an earlier version set up. It keeps each existing file that differs from what it writes, and Doctor then reports the changes that break the setup.

Doctor no longer reports the "Legacy oxlint-tsgolint" finding (`legacy-oxlint-tsgolint`). Remove `oxlint-tsgolint` from `package.json` by hand. Adamantite runs the type-aware rules on tsrs.

Doctor no longer looks for rules in `.adamantite/rules`, the default rules folder before `.adamantite/lint`. It checks only `.adamantite/lint` and the folders that `custom()` calls load. Move the rules to `.adamantite/lint`, or load the folder with `custom({ dir: ".adamantite/rules" })`.

The findings for a tool's own JSON config beside the managed TypeScript config are renamed from "legacy" to "conflicting": `legacy-oxlint-config`, `legacy-oxfmt-config`, and `legacy-knip-config` become `conflicting-oxlint-config`, `conflicting-oxfmt-config`, and `conflicting-knip-config`, with the title "Conflicting <tool> configuration".

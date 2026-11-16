---
"adamantite": minor
---

Record the setup in `.adamantite/adamantite-lock.json`, and run `init` and `update` through one setup

`init` now writes `.adamantite/adamantite-lock.json` at the project root, or at the workspace root of a monorepo. The lockfile records the selection that `init` set up, the Adamantite version that wrote it, and the hash of each file that Adamantite wrote whole. A later `init` adds its options to the selection, and `update` writes the lockfile again with the installed version.

`init` and `update` now differ only in where the selection comes from. `init` takes it from the prompts or the flags, and `update` takes it from the lockfile. Both then install the packages, set the managed scripts, write the managed files, write the lockfile, and report the findings that remain. So `init` now prints the findings that `adamantite doctor` would report, such as a missing extension in a `.vscode/extensions.json` that you changed.

- Installs cover Oxlint, tsrs, Oxfmt, Knip, Sherif, the managed plugin of each selected preset, and `adamantite` itself at the version that runs the command. They include only the packages that `package.json` does not declare at the managed version. `update` prints them under "Packages installed", and no longer updates a tool that the setup does not select. A package that a pnpm catalog declares stays as it is, and Doctor reports an outdated catalog entry.
- Sherif is installed in every monorepo whose setup includes the `analyze` script, by `update` as well as `init`. A single-package project gets no Sherif.
- Each file that `init` and `update` write whole, and the lockfile, is formatted with the Oxfmt that the project installs. They use the project's Oxfmt config, or Adamantite's format preset when the project has none yet, and record the hash of the formatted file. So `adamantite check` passes on these files, and `adamantite fix` leaves them as they are. `package.json` gets the same layout when `init` or `update` changes it. A project that installs no Oxfmt gets each file as Adamantite renders it. When the project's Oxfmt config does not load, `init` and `update` fail before they write a file, with an error that names the file.

Doctor now checks each integration that the lockfile selects. A selected integration whose file is missing or wrong gets a finding, such as a `tsconfig.json` that no longer extends the selected TypeScript preset. An integration that the lockfile does not select gets no findings.

A project without a lockfile gets the `lockfile-missing` finding alone, from `adamantite doctor` and from `adamantite update`, and both exit 1. `update` no longer reads a setup from the project files, and Doctor no longer prints the "No Adamantite-managed setup found" warning. When the lockfile does not decode or has an unknown `schemaVersion`, Doctor reports the `invalid-lockfile` or `unsupported-lockfile` finding, and `init` and `update` fail before they change a file, with an error that says to run `adamantite doctor`.

`update` no longer removes the `adamantite` entry from `skills-lock.json`, because Adamantite does not edit a file that another tool owns. When the setup includes agent guidance and that lock records the skill, Doctor reports the `skills-lock-adamantite-entry` finding.

To migrate, run `adamantite init` once in each project that an earlier version set up, with the options that the project uses, and commit `.adamantite/adamantite-lock.json`. `init` keeps each existing file that differs from what it writes, and Doctor then reports the changes that break the setup.

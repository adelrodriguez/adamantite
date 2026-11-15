---
"adamantite": minor
---

Record the setup selection in `.adamantite/adamantite-lock.json`, and check it with Doctor

`init` now writes `.adamantite/adamantite-lock.json` at the project root, or at the workspace root of a monorepo. The lockfile records the selection that `init` set up, the Adamantite version that wrote it, and the hash of each file that Adamantite wrote whole. A later `init` adds its options to the selection. `update` writes the lockfile again with the installed version. In a project without a lockfile, `update` records the setup that the project files show.

Doctor now checks each integration that the lockfile selects. A selected integration whose file is missing or wrong gets a finding, such as a `tsconfig.json` that no longer extends the selected TypeScript preset, or a selected editor or workflow whose file does not exist. An integration that the lockfile does not select gets no findings. A project without a lockfile gets a `lockfile-missing` finding.

To migrate, run `adamantite update` once in each project that an earlier version set up, check the recorded selection, and commit `.adamantite/adamantite-lock.json`. When `.adamantite/adamantite-lock.json` does not decode or has an unknown `schemaVersion`, Doctor reports an `invalid-lockfile` or `unsupported-lockfile` finding for a coding agent, and `init` and `update` fail with an error that names the file and says to run `adamantite doctor`.

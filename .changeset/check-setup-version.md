---
"adamantite": minor
---

Fail `adamantite check` when the lockfile records another Adamantite version than the project installs

After an update of the `adamantite` package, the managed packages, the managed files, and the Adamantite skill stay at the old version until `adamantite update` runs. `adamantite check` now runs its stages as before, then fails with a line that names the version in `.adamantite/adamantite-lock.json`, the installed version, and the repair. `adamantite doctor` reports the same state as the `setup-outdated` finding, or as `setup-ahead` when a newer Adamantite wrote the lockfile.

The comparison uses the Adamantite that the project installs, so a CLI from another install, such as `npx`, judges the project as the project's own CLI does. A project without a lockfile, or one that installs no Adamantite, passes this step. `update` writes the lockfile again with the installed version, also when no managed file changes.

To migrate, run `adamantite update` after each update of the `adamantite` package, and commit the changes. When the check says that a newer Adamantite wrote the lockfile, install the dependencies instead, because `update` with the older version would bring the setup back to it.

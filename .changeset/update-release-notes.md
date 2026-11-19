---
"adamantite": minor
---

Ship the changelog, and print the notes of each release since the recorded version in `adamantite update`

The package now ships `CHANGELOG.md`, so the notes that an agent reads match the installed version. Before, the Adamantite skill and Doctor linked the changelog on GitHub `main`, which can name releases that the project does not run.

- `adamantite update` reads the version that the lockfile recorded before it writes the installed version, and prints the notes of each release since then, oldest first. A terminal gets one link to the GitHub release of each version. A run without a terminal prints the notes as Markdown. `adamantite update --json` puts them in `releaseNotes`, with the path of the changelog and the recorded version in `from`. `releaseNotes` is `null` for `init`, and for `update` when it has no range to read.
- The `oxlint-config-load-failure` finding now names the path of the installed changelog, and tells the agent to search it for a preset that the package no longer exports. The Adamantite skill gives the same repair.

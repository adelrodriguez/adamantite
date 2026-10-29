---
"adamantite": patch
---

`adamantite harden` now stops before it prints the prompt when the project does not install the Adamantite version that runs the command. It finds the install as Oxlint loads the preset, so a package that the package manager hoists to a parent `node_modules` counts. The message tells you to run the project's own Adamantite or to install the dependencies again. The prompt offers the presets and rules of the version that runs, so a stale install made the agent propose rules that the project cannot load. `harden` also runs in an Adamantite checkout of the same version, which does not depend on itself.

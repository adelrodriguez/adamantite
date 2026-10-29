---
"adamantite": patch
---

`adamantite harden` now fails before it prints the prompt when `node_modules` does not hold the Adamantite version that runs the command, and tells you to run the project's own Adamantite or install the dependencies again. The prompt offers the presets and rules of the version that runs, so a stale install made the agent propose rules that the project cannot load. `harden` also runs in the Adamantite repository, which does not depend on itself.

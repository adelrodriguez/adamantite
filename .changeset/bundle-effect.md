---
"adamantite": patch
---

Bundle Effect into the CLI, so commands start sooner and installs skip `effect` and `@effect/platform-node`

The CLI and the Oxlint entry now include the Effect modules that they use. Node.js loads three files at startup in place of more than two hundred Effect modules, and it keeps the compiled code of the CLI in its compile cache, so later runs of `adamantite check` and `adamantite fix` reach Oxlint and Oxfmt sooner. Adamantite no longer installs `effect` or `@effect/platform-node`. A project that imports them lists them itself, as it already had to.

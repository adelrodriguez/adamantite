---
"adamantite": patch
---

Stop predicting which Oxlint binding and tsrs binary load in Doctor

Doctor no longer guesses which `@oxlint/binding-*` or `@tsrs/*` platform package Oxlint and tsrs load on this machine, a choice that it copied from their loaders and that could disagree with them. It still reports a missing declared package, a missing `tsrs-lint` launcher, and an `@effect/tsgo` without a build or the bridge for the installed versions.

When the platform package is missing, `adamantite check` stops with the error of the tool that needs it. Oxlint prints `Cannot find native binding` with each file that it tried, and tsrs names the missing `@tsrs/*` package. The Adamantite skill tells agents to reinstall the dependencies with optional dependencies for this platform.

Doctor runs Oxlint, so a missing Oxlint binding still gives the `oxlint-config-load-failure` finding with Oxlint's error. The finding is now titled "Oxlint stops before it lints a file", and it tells the agent to reinstall the dependencies, not to change the config, when the error says `Cannot find native binding`.

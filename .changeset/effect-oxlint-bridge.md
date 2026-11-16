---
"adamantite": patch
---

Load the Effect build of Oxlint through `@effect/tsgo/oxlint-bridge`, and report a missing binding package in Effect projects

The Oxlint entry that `adamantite check`, `adamantite fix`, and the editors run no longer sets `NAPI_RS_NATIVE_LIBRARY_PATH`. It loads `@effect/tsgo/oxlint-bridge`, which swaps Oxlint's installed binding for the Effect build as Oxlint loads it and leaves every other napi-rs binding unchanged.

The bridge needs the installed `@oxlint/binding-<platform>` package, so Doctor now checks for that package in a project with `@effect/tsgo` too. Doctor also reports an `@effect/tsgo` that ships no bridge. Run `adamantite update` to install the managed version.

---
"adamantite": patch
---

Accept paths that go through a directory symlink in `rule add test` and `harden`

On macOS, `/var` is a symlink to `/private/var`, so a project in the temporary folder has two spellings. `adamantite rule add test <name> --path <absolute path>` wrote a rule import that mixed the two spellings, and `adamantite rule test` then failed with `ERR_MODULE_NOT_FOUND`. `adamantite harden --path` rejected such a folder as outside the project. Both commands now resolve the symlinks before they compare paths.

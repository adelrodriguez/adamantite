---
"adamantite": patch
---

Share Node.js's compile cache with the tools that Adamantite starts, so Oxlint starts sooner

`bin/adamantite` sets `NODE_COMPILE_CACHE` to its own compile cache folder for every process that the CLI starts, unless you set the variable yourself. Oxlint then loads its own compiled code from the cache instead of compiling its JavaScript on every run. `NODE_DISABLE_COMPILE_CACHE` still turns the cache off.

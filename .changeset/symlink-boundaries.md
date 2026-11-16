---
"adamantite": patch
---

Report an import that reaches a protected file through a symlink in `adamantite/layers` and `adamantite/import-owners`

Both rules now find an imported file by its real path. Before, an import through a folder link, such as `./link/api.ts` with `src/low/link` linked to `../high`, or through a source-file link, reached a higher layer or an owned module without a report. A path through `node_modules` keeps its package, so a bare import of a linked workspace package still matches its package name and stays outside every layer map. A project below a linked folder, such as `/tmp` on macOS, gets the same reports.

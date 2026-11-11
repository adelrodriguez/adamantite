---
"adamantite": minor
---

Set up the TypeScript preset without the `check` or `fix` script

`init` now asks about the TypeScript preset whatever scripts you select, and the scripts question accepts no selection. `adamantite init --non-interactive --typescript` sets up only the preset. A non-interactive run needs at least one `--script` or `--typescript`. When you select no setup in an interactive run, `init` makes no changes.

Doctor now checks `tsconfig.json` only when it extends `adamantite/typescript`. It no longer reports a missing `tsconfig.json` or a config that does not extend the preset, so a project that declined the preset gets no finding. Oxlint's type check runs without a `tsconfig.json`.

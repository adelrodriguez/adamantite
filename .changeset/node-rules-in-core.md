---
"adamantite": minor
---

Move the Node.js lint rules into core

Core now enables `node/handle-callback-err`, `node/no-exports-assign`, `node/no-mixed-requires`, `node/no-new-require`, and `node/no-path-concat`. The separate `adamantite/lint/node` preset and `--preset node` choice are removed. Doctor reports the retired import.

Remove the Node preset import and its `extends` entry from `oxlint.config.ts`. Keep the core `adamantite/lint` preset and any `node/*` rule settings. Remove `--preset node` from init commands.

Oxlint matches the name `require` in the mixed-declaration and constructor rules even when it names a local parameter. Rename those parameters to names such as `loadModule` and `Module`. The callback rule also reports a declaration parameter named `err`, which can be renamed to `error`. These upstream limitations remain tracked in [issue #843](https://github.com/adelrodriguez/adamantite/issues/843).

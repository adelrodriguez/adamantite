---
"adamantite": patch
---

Skip root `tsconfig.json` creation and updates during `init` in a detected monorepo. A catch-all root config makes TypeScript treat all workspace packages as one project and can try to emit over JavaScript input files. In a monorepo, `init --typescript` now prints guidance to add `"extends": "adamantite/typescript"` to each package's `tsconfig.json` or to a shared base config, and does not change any files.

Stop overwriting an existing `extends` value when `init` updates a `tsconfig.json`. Adamantite now appends `"adamantite/typescript"` to the `extends` array instead, so a shared base config such as `"@company/tsconfig"` stays in place. The preset is appended last, so its compiler options override the earlier entries.

The `adamantite/typescript` preset now sets `"noEmit": true`, so projects that extend it type-check without emitting output. If your project emits output with `tsc` through the preset, set `"noEmit": false` in your own `tsconfig.json`.

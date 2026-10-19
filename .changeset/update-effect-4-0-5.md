---
"adamantite": patch
---

Update the runtime dependencies `effect`, `@effect/platform-node`, and `@effect/platform-node-shared` to 4.0.5.

Effect 4.0.2 and later tag each module as stable or unstable. The unstable modules include `effect/FileSystem`, `effect/Path`, and all modules in `@effect/platform-node` and `@effect/vitest`. With the effect preset, `effecttsgo/unstable-api-usage` reports each use of them after you update Effect. To use them on purpose, list them in `allowedUnstableApis` in the `@effect/language-service` entry of `tsconfig.json`. An entry can be a module, such as `effect/Path`, or a full package, such as `@effect/vitest`.

---
"adamantite": minor
---

Write `tsconfig.json` as a managed file, and stop merging the TypeScript preset and the Effect language service entry

`adamantite init` and `adamantite update` now write `tsconfig.json` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. The file extends the selected TypeScript preset, and adds the `@effect/language-service` entry when the setup includes the `effect` preset. Init no longer merges `extends` or the language service entry into a `tsconfig.json` that you wrote, and no longer stops or prints a change to make by hand when it has comments. It keeps your file, and `adamantite doctor` reports a missing or mismatched preset, type resets in a library, and a missing language service entry. Doctor finds the preset through each base config that `extends` reaches, such as a shared `tsconfig.base.json` or the `tsconfig.json` of a config package, and resolves each one as TypeScript does. A config that an earlier version wrote and nobody changed is replaced with the current version, and `update` deletes it when the setup no longer names a TypeScript preset.

In a monorepo, Adamantite still writes no root `tsconfig.json`, and Doctor reports the packages that need the preset instead of `init` printing guidance. A root `tsconfig.json` that Adamantite wrote before the project became a monorepo stays managed.

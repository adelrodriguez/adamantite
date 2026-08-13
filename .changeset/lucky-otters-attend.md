---
"adamantite": patch
---

Skip root `tsconfig.json` creation and updates in the `legacy-typecheck-script` migration when a monorepo is detected. The migration, reachable through `adamantite update` and `adamantite doctor --fix`, previously wrote back the catch-all root config that `init` stopped writing in monorepos. It now prints the same guidance as `init` — add `"extends": "adamantite/typescript"` to each package's `tsconfig.json` or to a shared base config — and its validation no longer reports a failure for the deliberately absent file.

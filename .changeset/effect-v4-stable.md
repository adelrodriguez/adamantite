---
"adamantite": patch
---

Update Effect, `@effect/platform-node`, and `@effect/vitest` to the stable 4.0.0 release. Before this change, fresh installs resolved `@effect/platform-node-shared` to rc.118 next to `effect` rc.115, and the CLI crashed at start with `fiber.succeedWith is not a function`. Now all Effect packages resolve to one 4.0.0 runtime.

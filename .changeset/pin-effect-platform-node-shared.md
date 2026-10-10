---
"adamantite": patch
---

Fix `npm install adamantite`, which hung. `@effect/platform-node` accepts any `@effect/platform-node-shared@^4.0.0`, and each `@effect/platform-node-shared` release requires the matching `effect` version, which differs from the `effect@4.0.0` that Adamantite pins. Since `@effect/platform-node-shared@4.0.3`, which requires the unpublished `effect@4.0.3`, npm repeated the resolution forever. Adamantite now pins `@effect/platform-node-shared@4.0.0`, aligned with `effect` and `@effect/platform-node`.

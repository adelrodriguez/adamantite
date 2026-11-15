---
"adamantite": patch
---

Stop depending on `@effect/platform-node-shared` directly

Adamantite pinned `@effect/platform-node-shared` because `@effect/platform-node@4.0.0` accepted any `^4.0.0` release, and npm installs then hung (#511). `@effect/platform-node@4.1.2` depends on `@effect/platform-node-shared` at exactly `4.1.2`, so the direct dependency did nothing. Installs resolve the same version as before.

---
"adamantite": patch
---

Fix `npm install adamantite` hanging when Effect publishes a partial release

`@effect/platform-node` reaches `@effect/platform-node-shared` through a caret range. When upstream published `@effect/platform-node-shared@4.0.0-rc.117` before the matching `effect` release, npm could not resolve the install and never finished, which also stalled `adamantite init`. Adamantite now depends on `@effect/platform-node-shared` at the exact version that matches its `effect` version. `oxc-parser` is pinned to an exact version too, like every other dependency.

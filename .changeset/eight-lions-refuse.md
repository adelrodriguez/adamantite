---
"adamantite": patch
---

Surface GitHub Actions setup failures during `adamantite init` instead of silently continuing. When the workflow cannot be written, `init` now warns with the underlying reason and a recovery hint. `doctor` and `update` also assess integrations concurrently and read `package.json` once per assessment pass instead of once per integration.

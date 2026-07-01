---
"adamantite": patch
---

Derive the managed tooling versions from Adamantite's own `package.json` at build time instead of maintaining separate hardcoded constants, so the versions installed by `adamantite init` always match the pinned dependencies: Oxfmt (`0.57.0`), Oxlint (`1.72.0`), oxlint-tsgolint (`0.24.0`), Sherif (`1.12.0`), and Knip (`6.23.0`).

---
"adamantite": patch
---

Add self-referencing dependency and update development tooling

**New Features:**

- Added `adamantite` as a dependency to enable dogfooding and self-testing of the package configuration

**Updated Dependencies:**

Development dependencies:

- `sherif` from 1.7.0 to 1.7.1
- `tsdown` from 0.15.11 to 0.15.12

This change allows the project to use its own presets and configurations, ensuring consistency and validating that the package works correctly in real-world usage. The development dependency updates bring the latest bug fixes and improvements from upstream packages.

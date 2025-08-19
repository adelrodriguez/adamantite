---
"adamantite": patch
---

Update Biome version from 2.1.4 to 2.2.0

- Updated package dependency and configuration schema
- Migrated renamed rules to new naming conventions
- Moved promoted rules from nursery to stable groups:
  - `noAwaitInLoops` moved to performance group
  - `noUselessRegexBackrefs` moved to suspicious group
- Added new rules:
  - `noBarrelFile`

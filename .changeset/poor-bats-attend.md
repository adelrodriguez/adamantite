---
"adamantite": patch
---

Update dependency versions to fix test failures

**Updated Dependencies:**

Development dependencies:
- `@biomejs/biome` from 2.3.8 to 2.3.10
- `@types/bun` from 1.3.3 to 1.3.5
- `tsdown` from 0.17.0-beta.4 to 0.18.1
- `type-fest` from 5.2.0 to 5.3.1

Peer dependencies:
- `@biomejs/biome` from 2.3.8 to 2.3.10

**Internal Changes:**
- Updated hardcoded `biome.version` in helpers from 2.3.2 to 2.3.10 to match installed package
- Updated hardcoded `sherif.version` in helpers from 1.7.0 to 1.9.0 to match installed package

These changes ensure version consistency between hardcoded references in the codebase and actual installed dependencies, resolving test failures that check for version alignment.
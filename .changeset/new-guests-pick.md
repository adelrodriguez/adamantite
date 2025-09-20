---
"adamantite": patch
---

Relax filename convention rules in Biome configuration

Removed the restrictive `match` pattern constraint from the `useFilenameConvention` rule while keeping the `kebab-case` requirement. This change makes the linting rules more permissive by removing the overly restrictive regex pattern matching, which can help reduce false positives in projects with diverse naming requirements.

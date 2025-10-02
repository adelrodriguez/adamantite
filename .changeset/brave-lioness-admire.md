---
"adamantite": patch
---

Enhanced `useFilenamingConvention` rule to support special characters in filenames

Updated the filename convention rule with a custom `match` regex pattern that allows special characters such as `$`, `[`, and `]` in filenames while maintaining kebab-case naming conventions. This change enables proper validation of framework-specific file naming patterns, such as Next.js dynamic routes (`[id].ts`, `[...slug].ts`) and SvelteKit route parameters (`$lib`, `[param].svelte`), without triggering false positive linting errors.

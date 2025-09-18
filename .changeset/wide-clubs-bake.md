---
"adamantite": patch
---

Remove Next.js-specific Biome rules from general-purpose TypeScript preset

Removed `noHeadElement` and `noHeadImportInDocument` rules that are specific to Next.js framework usage. These rules prevent using HTML `<head>` elements and importing head-related functionality in wrong contexts, but they can cause false positives and confusion in non-Next.js TypeScript projects.

As a general-purpose TypeScript preset, Adamantite should focus on universal TypeScript and JavaScript best practices rather than framework-specific rules. Projects using Next.js can enable these rules through Biome's Next.js domain configuration when needed.

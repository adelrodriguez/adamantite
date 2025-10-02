---
"adamantite": patch
---

Allow non-ASCII characters in filenames by setting `requireAscii: false` in the `useFilenameConvention` rule

The Biome configuration now permits special characters like `$` in filenames while maintaining the `kebab-case` naming requirement. This change resolves linting errors for route files with special characters (e.g., `auth.$.ts` in web frameworks that use `$` for dynamic routes) without compromising the overall filename convention standards.

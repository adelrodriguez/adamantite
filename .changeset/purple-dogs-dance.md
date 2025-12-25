---
"adamantite": minor
---

Add TypeScript checking option and improve preset export naming

**Breaking Change:**

- **Export path update**: The TypeScript preset export has been renamed from `adamantite/tsconfig` to `adamantite/typescript` for better clarity and consistency with package naming conventions

**New Features:**

- **TypeScript checking option**: The `init` command now includes a `typecheck` script option that runs `tsc --noEmit` for type-checking without emitting files
- **Conditional TypeScript installation**: TypeScript is now only installed as a dependency when the `typecheck` option is selected, reducing unnecessary dependencies
- **Enhanced init flow**: Users can now choose to include TypeScript type-checking as part of their development workflow during initialization

**Migration:**

If you're currently using the TypeScript preset, update your `tsconfig.json`:

```diff
{
-  "extends": "adamantite/tsconfig"
+  "extends": "adamantite/typescript"
}
```

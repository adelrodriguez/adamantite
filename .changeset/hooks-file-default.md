---
"adamantite": patch
---

Allow hooks in a `hooks.ts` file by default in `adamantite/no-react-state-hooks`

The default `allow` list now includes `**/hooks.{ts,tsx}`, for a feature that keeps its hooks in one file, such as `features/cart/hooks.ts`. If your `allow` option repeats the defaults to add this glob, you can remove the option.

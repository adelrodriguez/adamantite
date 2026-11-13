---
"adamantite": patch
---

Stop allowing camelCase hook file names by default in `adamantite/no-react-state-hooks`

The default `allow` list no longer includes `**/use[A-Z]*.{ts,tsx}`. The core preset's `unicorn/filename-case` reports a file such as `useCounter.ts` and asks for `use-counter.ts`, so the default named a hook module that core does not accept. Rename a hook module such as `useCounter.ts` to `use-counter.ts`, or move it under a `hooks` directory. A project that keeps camelCase file names can add `"**/use[A-Z]*.{ts,tsx}"` to the rule's `allow` option.

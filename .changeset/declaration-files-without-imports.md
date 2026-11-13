---
"adamantite": patch
---

Accept a declaration file that has no `import` or `export` in the core preset

The core lint preset now turns off `import/unambiguous` in `*.d.ts` files. A declaration file without an `import` or `export` is a script on purpose, because only a script can declare a wildcard module, such as `declare module "*?raw"`, or a global. You can delete an override that turns the rule off for these files.

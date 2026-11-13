---
"adamantite": patch
---

Accept a type and a value that share a name in the core preset

The core lint preset now turns off `no-redeclare` in TypeScript files. The rule reported `const Port = Schema.Number` with `type Port = typeof Port.Type`, which TypeScript permits. The type check still reports a value that is declared two times, such as a second `function run()`.

The setting is in an override of the preset. To change `no-redeclare` for TypeScript files, set it in an `overrides` entry of your config, because the preset's override takes priority over top-level `rules`.

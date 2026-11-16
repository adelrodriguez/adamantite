---
"adamantite": patch
---

Describe Adamantite as agent-first, and document preset overrides and core advice in the README

- The npm description and the README tagline now read "Strict, agent-first code-quality toolchain for TypeScript codebases." The README introduction says that Adamantite helps coding agents write excellent code.
- A top-level `rules` setting has no effect on a rule that a preset sets in an override, for the files of that override, and Oxlint gives no warning. The README now gives the order in which Oxlint applies `rules` and `overrides`, and lists the files and rules of each override in the core, strict, tailwind, jest, and vitest presets.
- The README explains that, with the strict preset, the help of `typescript/no-explicit-any`, `typescript/no-wrapper-object-types`, and `unicorn/no-instanceof-builtins` recommends a form that strict reports. Follow the strict report that comes next, which names a form that both presets accept.
- The README no longer links to the architecture decision records, which no longer exist.

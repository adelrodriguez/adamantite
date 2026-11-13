---
"adamantite": patch
---

Report a preset that comes before core in `extends`

Oxlint applies the `extends` entries of `oxlint.config.ts` in order, and a later entry replaces the rules of an earlier one. The strict preset changes three rules of core, and the effect preset turns three off. With `extends: [strict, core]`, core replaced those changes, so the ban on type assertions was off, and no tool reported it. `adamantite doctor` now reports each Adamantite preset that comes before core, and tells you to move core to the first position.

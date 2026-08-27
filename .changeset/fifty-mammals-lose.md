---
"adamantite": minor
---

Format binary and ternary operators at the start of continuation lines

The format preset now sets `experimentalOperatorPosition: "start"`, so multiline conditions place `&&`, `||`, `??`, and ternary operators at the beginning of the wrapped line instead of the end. The managed oxfmt version moves to 0.65.0, which supports the option. Expect a one-time reformat of multiline expressions the next time you run `format`.

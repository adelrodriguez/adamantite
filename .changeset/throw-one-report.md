---
"adamantite": patch
---

Report a thrown value that is not an error one time in the core preset

The core lint preset no longer enables `no-throw-literal`. `typescript/only-throw-error` reads the type of the thrown value, so it reports every throw that `no-throw-literal` reported, such as `throw "failed"` or `throw undefined`. One throw got two reports, and a suppression had to name both rules. A suppression can now name only `typescript/only-throw-error`.

---
"adamantite": patch
---

Match Oxlint report paths with `/` in `rule try` and `harden` on Windows

On Windows, Oxlint can print a file name such as `src\cart.ts`, while `adamantite rule try` and the override check of `adamantite harden` compare it with `src/cart.ts`. A reported case could then read as accepted, and a file that breaks a rule could read as clean. Adamantite now reads each file name in the Oxlint report with `/` between folders.

---
"adamantite": patch
---

Stop a second rule file from silently replacing a custom rule with the same name

A rules folder with `no-foo.js` and `no-foo.ts` loaded only one of them, chosen by the order of the folder listing, so a rule could disappear without an error. `custom()` now fails the lint run with a message that names both files. `adamantite rule add no-foo` also refuses to write `no-foo.ts` when a rule file with another extension, such as `no-foo.js`, already exists.

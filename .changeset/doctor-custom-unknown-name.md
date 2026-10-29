---
"adamantite": patch
---

Doctor checks the rules folders of a `custom()` call whose `name` is not a string literal. Before,
such a call turned off the check for rules folders that no `custom()` call loads, and its warning
said that Doctor did not check the folder. Now only a `dir` that is not a string literal turns off
that check, and a `name` that is not a string literal gets its own warning.

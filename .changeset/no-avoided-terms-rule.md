---
"adamantite": minor
---

Add the `adamantite/no-avoided-terms` rule. It reads the nearest `GLOSSARY.md` and reports declared
names and JSX text that use a term that the glossary lists after `_Avoid_:`, and each message
names the glossary term to use instead. It skips an avoided term that is part of a glossary term,
and its `allow` option lists terms that mean something else in the project. The `strict` preset
loads the rule, and the project turns it on.

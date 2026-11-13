---
"adamantite": patch
---

Ship the anti-slop rules of the strict preset as Adamantite's own code

The strict preset now loads the anti-slop rules from Adamantite's source instead of a vendored build. The rules keep their `anti-slop/*` names and report the same code, so project settings and suppression comments keep working.

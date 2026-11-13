---
"adamantite": patch
---

Ship the anti-slop-effect rules of the effect preset as Adamantite's own code

The effect preset now loads the anti-slop-effect rules from Adamantite's source instead of a vendored build. The rules keep their `anti-slop-effect/*` names and report the same code, so project settings and suppression comments keep working.

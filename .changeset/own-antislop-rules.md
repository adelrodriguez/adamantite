---
"adamantite": minor
---

Ship the strict and effect rules as first-party code under the `antislop` and `antislop-effect` namespaces

This breaks rule settings and suppression comments that use `anti-slop/*` or `anti-slop-effect/*`. Replace those prefixes with `antislop/` and `antislop-effect/`. Keep the rule severity, options, and suppression reasons.

Run `adamantite doctor` to list each old config key and suppression with its replacement. Make those changes, run `adamantite check`, then run Doctor again. If Doctor cannot list the linted files, repair the config and run Doctor again to check the suppressions. `adamantite update` also shows remaining migration findings.

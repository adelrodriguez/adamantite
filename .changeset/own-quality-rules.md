---
"adamantite": minor
---

Ship the strict and effect rules as first-party code under the `quality` and `quality-effect` namespaces

This breaks rule settings and suppression comments that use `anti-slop/*` or `anti-slop-effect/*`. Replace those prefixes with `quality/` and `quality-effect/`, except `anti-slop/no-module-mocking`, which is now `testing/no-doubles` of the new `testing` plugin. Keep the rule severity, options, and suppression reasons.

A config that still sets an `anti-slop/*` or `anti-slop-effect/*` rule fails to load, and Doctor reports the load error. `adamantite check` reports a suppression comment with an old name as an unused directive. Rename each one, run `adamantite check`, then run Doctor again.

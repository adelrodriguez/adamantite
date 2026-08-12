---
"adamantite": patch
---

Derive tooling config state, legacy-config warnings, and migration checks from a single detection pass so `init`, `doctor`, and `update` report consistent messages, run `update` migrations from migration checks directly, and point `adamantite init` users to `adamantite doctor --fix` when a legacy config is preserved.

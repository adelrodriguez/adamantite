---
"adamantite": minor
---

After an agent session, `adamantite harden` now also runs the custom rule tests, as `adamantite rule test` does: first `check`, then `rule test`, then the Doctor assessment. When a rule test fails, `harden` says "`adamantite rule test` failed after the <agent> session." and exits 1. A project with no rule tests passes this step. The "Verify" section of the harden prompt tells the agent to run the three commands in the same order.

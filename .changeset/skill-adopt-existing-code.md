---
"adamantite": patch
---

Teach agents to adopt Adamantite in existing code

The setup guide of the `adamantite` skill now has a section for code written before the setup. The agent runs `adamantite fix`, counts the remaining reports and files for each rule from `adamantite check --only lint -- --format json`, fixes the rules with few reports, and turns each remaining rule off only in the files that break it now, in an Oxlint override. It keeps each preset rule at `error`, and does not add disable comments or turn a rule off for the whole project.

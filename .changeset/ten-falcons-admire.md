---
"adamantite": patch
---

Give Adamantite's agent instructions task guides and explicit verification checks

The skill now links to separate setup, preset repair, and custom-rule guides. It corrects
the Effect diagnostics setting, removes obsolete update instructions about patching Oxlint
and TypeScript, and supplies complete TypeScript configuration examples.

The Doctor prompt gives each step a completion check, reports missing evidence, and separates
verified results from blocked work. Init points agents to the shipped skill and the workspace's
managed scripts.

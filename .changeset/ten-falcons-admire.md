---
"adamantite": patch
---

Give Adamantite's agent instructions task guides and explicit verification checks.

The skill now links to separate setup, preset repair, and custom-rule guides. It corrects
the Effect diagnostics setting, removes obsolete update instructions about patching Oxlint
and TypeScript, and supplies complete TypeScript configuration examples.

Harden and Doctor prompts give each step a completion check, report missing evidence,
and distinguish verified results from blocked work. Harden uses the custom-rule guide for
authoring and verification, and keeps its approval question last. Init points agents to the
shipped skill and the workspace's managed scripts.

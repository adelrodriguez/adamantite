---
"adamantite": patch
---

Keep the `adamantite` dependency that a project already has when `adamantite init` runs. Before, `init` installed `adamantite` from the registry every time, which replaced a pinned version, a `file:` path, or a workspace link with the latest published version. `init` still installs the pinned Oxlint, Oxfmt, Knip, and Sherif versions.

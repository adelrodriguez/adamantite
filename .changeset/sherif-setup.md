---
"adamantite": patch
---

Install Sherif in `adamantite update` for a monorepo that runs `analyze`

`adamantite update` now installs the managed Sherif version in every monorepo whose recorded setup includes the `analyze` script, as `init` does, instead of only updating a Sherif that the project already declares. A single-package project still gets no Sherif.

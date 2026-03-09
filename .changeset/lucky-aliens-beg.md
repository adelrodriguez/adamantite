---
"adamantite": patch
---

Include `knip` in `adamantite update` dependency checks

`adamantite init` installs `knip`, but `adamantite update` wasn't checking it for version updates. Now `knip` is included alongside `oxlint`, `oxfmt`, and `sherif` so users get prompted when their version falls behind.

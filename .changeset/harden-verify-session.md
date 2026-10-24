---
"adamantite": minor
---

After a coding agent session, `adamantite harden` runs Oxfmt and Oxlint as `adamantite check` does,
and assesses the project as `adamantite doctor` does. It exits 1 and says which one failed when
either fails. A copy of the prompt or "do nothing" exits 0 without verification. The Adamantite
skill now documents `harden`.

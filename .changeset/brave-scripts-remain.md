---
"adamantite": patch
---

Stop `init` from silently overwriting existing package scripts. Scripts whose commands differ from Adamantite's managed commands are now kept and reported: the interactive initializer asks once before overwriting, and non-interactive runs preserve them unless the new `--overwrite-scripts` flag is passed. Preserved scripts are omitted from AGENTS.md guidance.

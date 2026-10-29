---
"adamantite": patch
---

Doctor and `adamantite harden` resolve Oxlint config imports with `oxc-resolver`, as Node.js loads
the config, and now also follow `#` imports. A workspace package resolves after an install: before
it, Doctor warns that it cannot resolve the import and says to install the dependencies.

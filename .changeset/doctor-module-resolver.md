---
"adamantite": patch
---

Resolve Oxlint config imports in Doctor as Node.js does

Doctor resolves the imports of an Oxlint config with `oxc-resolver`, as Node.js does when it loads the config, and now also follows `#` imports. A workspace package resolves after an install. Before the install, Doctor warns that it cannot resolve the import and says to install the dependencies.

---
---

Refactor `runProcess` helper from `execSync` to `spawnSync` for improved security and reliability. This change eliminates command injection risks by using argument arrays instead of string concatenation, while maintaining the same interface and behavior.
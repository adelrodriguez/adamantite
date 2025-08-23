---
"adamantite": patch
---

Refactor dependency management to use nypm API and improve update command reliability

- Replace custom `runProcess` utility with nypm's `dlxCommand` and `addDevDependency` functions
- Improve package manager detection using nypm's built-in detection instead of manual lock file checking
- Update all command files to use consistent error handling and execution patterns
- Remove unused utilities and corresponding test cases
- Fix update command error handling to use Promise.allSettled() instead of sequential await in loops
- Enhance update command to attempt all dependency updates and report detailed success/failure status
- Improve TypeScript compatibility and resolve linter warnings in update command
- Add nypm as a dependency to enable more robust package manager operations

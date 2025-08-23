---
"adamantite": minor
---

Add `ci` command for continuous integration workflows with enhanced reporter options.

## CLI Enhancements

- **Added**: `ci` command for running Biome CI checks in continuous integration environments
- **Added**: `--github` flag to the `ci` command for GitHub Actions reporter output
- **Added**: `--monorepo` flag to the `ci` command for additional monorepo-specific checks using Sherif
- **Refactored**: Command option handling to use consistent destructured options pattern across all commands

This update adds CI-specific functionality optimized for automated environments while maintaining compatibility with existing lint and format commands.

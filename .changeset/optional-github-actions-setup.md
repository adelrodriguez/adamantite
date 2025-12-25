---
"adamantite": minor
---

Add optional GitHub Actions workflow setup during init

- Added a new prompt during `adamantite init` to optionally create a GitHub Actions workflow
- The workflow runs all enabled check scripts (check, format, typecheck, check:monorepo)
- Automatically uses the detected package manager (npm, yarn, pnpm, or bun) with the correct setup steps
- Creates `.github/workflows/adamantite.yml` with proper caching and concurrency settings
- Removed the `ci` command in favor of the generated workflow approach

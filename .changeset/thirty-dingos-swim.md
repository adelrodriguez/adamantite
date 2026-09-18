---
"adamantite": minor
---

Remove the deprecated `adamantite format` and `adamantite monorepo` commands.

Update package scripts, CI workflows, and agent instructions to use these replacements:

- Replace `adamantite format --check` with `adamantite check`.
- Replace `adamantite format` with `adamantite fix`.
- Replace `adamantite monorepo` with `adamantite analyze --only monorepo`.
- Replace `adamantite monorepo --fix` with `adamantite analyze --only monorepo --fix`.

`check` and `fix` also run Oxlint. To run only the formatter, use `oxfmt --check` or `oxfmt` directly.

`init --script` now accepts only `check`, `fix`, and `analyze`. Run `adamantite doctor` to find retired scripts and workflow steps that still need updates.

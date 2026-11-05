---
"adamantite": minor
---

Update the managed tooling versions: Oxlint 1.91.0, oxlint-tsgolint 7.0.2005, and oxfmt 0.76.0. Also update the runtime dependency `@oxlint/plugins` to 1.91.0.

Oxlint 1.90.0 and later need oxlint-tsgolint 7.0.2005 or later, so the two versions move together.

To upgrade an existing project:

- Run `adamantite update` to install the new versions.
- Expect `adamantite check` to report more code. Oxlint 1.89.0 fixed many rules so that they report cases they missed before. For example, `eslint/sort-keys` now checks computed keys, and `unicorn/prefer-string-replace-all` now resolves a regular expression in a variable.
- Expect `adamantite fix` to format HTML files differently. oxfmt 0.76.0 formats them with its own HTML formatter (oxc-project/oxc#28273).

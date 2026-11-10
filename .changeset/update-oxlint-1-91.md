---
"adamantite": minor
---

Update Oxlint to 1.91.0 and oxfmt to 0.76.0

The runtime dependency `@oxlint/plugins` moves to 1.91.0 with Oxlint.

To upgrade an existing project:

- Run `adamantite update` to install the new versions.
- Expect `adamantite check` to report more code. Oxlint 1.89.0 fixed many rules so that they report cases they missed before. For example, `eslint/sort-keys` now checks computed keys, and `unicorn/prefer-string-replace-all` now resolves a regular expression in a variable.
- Expect `adamantite fix` to format HTML files differently. oxfmt 0.76.0 formats them with its own HTML formatter (oxc-project/oxc#28273).

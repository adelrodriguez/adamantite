---
"adamantite": patch
---

Update the managed tooling versions: Oxfmt 0.73.0, Knip 6.42.0, `oxlint-plugin-react-doctor` 0.9.18, and `@shadcn/lint` 0.2.1. Also update the runtime dependency `oxc-parser` to 0.154.0.

Run `adamantite update` to install the new versions. Oxfmt 0.73 sorts the imports in Markdown code blocks, so `adamantite fix --only format` can change existing Markdown files after the update.

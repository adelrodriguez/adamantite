---
"adamantite": minor
---

Add the `adamantite/require-suppression-reason` rule, and turn it on in the `strict` preset. It
reports an `oxlint-disable` or `eslint-disable` comment, including the `-line` and `-next-line`
forms, that gives no reason after `--`, such as
`// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A single `-` is not
a reason. A project that selects `strict` gets a report on each suppression without a reason after
the update.

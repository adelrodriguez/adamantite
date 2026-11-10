---
"adamantite": minor
---

Require a reason on each lint suppression in the `strict` preset

The new `adamantite/require-suppression-reason` rule reports an `oxlint-disable` or `eslint-disable` comment, including the `-line` and `-next-line`
forms, that gives no reason after `--`, such as
`// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A single `-` is not
a reason. A project that selects `strict` gets a report on each suppression without a reason after
the update.

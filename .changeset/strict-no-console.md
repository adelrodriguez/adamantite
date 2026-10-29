---
"adamantite": minor
---

Move `no-console` from the core preset to the `strict` preset, and set it to `error`.
`console.info` stays allowed. A project that selects `strict` gets a lint error on each other
console call after the update. The repair is a fix, or a suppression with a reason, such as
`// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A project without
`strict` no longer gets `no-console` reports.

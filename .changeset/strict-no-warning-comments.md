---
"adamantite": minor
---

Turn on `no-warning-comments` in the `strict` preset. It reports a comment that starts with
`TODO`, `FIXME`, `XXX`, or `HACK`. A project that selects `strict` gets a report on each such
comment after the update. The repair is a fix to the code, or an issue in the project's issue
tracker in place of the comment.

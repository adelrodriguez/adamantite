# The strict preset bans task comments

A `TODO`, `FIXME`, `XXX`, or `HACK` comment marks a workaround or work that is not done. Coding
agents extend the patterns that they read, so they copy the workaround, and they read the comment
as permission to leave the real problem for later. We decided (2026-10-29) that the `strict`
preset turns on the native Oxlint rule `no-warning-comments` with the terms `todo`, `fixme`,
`xxx`, and `hack`.

The rule keeps its default location, `start`, so it reports a comment only when the term is the
first word. A comment such as "the hackathon page uses this" stays valid. String literals are
not comments, so the `TODO:` text in the custom rule stub that `adamantite rule add` writes is not
reported.

The rule goes in `strict`, not core: core holds rules that every project accepts, and some
projects keep task comments on purpose.

## Considered options

- **Ban all comments.** A comment that explains a workaround spreads the workaround, but
  `strict` and `antislop` require some comments: the reason on a suppression, and the safety
  comment on a type assertion. A ban on all comments also removes the comments that state why a
  design exists.
- **A first-party rule that reports workaround words anywhere in a comment.** Words such as
  "workaround" and "temporary" also describe correct code, so the rule would report too much.

## Consequences

- A project that selects `strict` gets a report on each task comment after the update. The
  repair is a fix to the code, or an issue in the project's issue tracker.
- The upstream message says "Remove or rephrase this comment". A rephrased comment passes the
  rule, so the Adamantite skill tells agents not to rephrase only to silence it.

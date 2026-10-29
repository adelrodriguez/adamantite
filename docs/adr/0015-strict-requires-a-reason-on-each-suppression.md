# The strict preset requires a reason on each suppression

Adamantite, v1, and 100times each say in prose that a lint suppression gives a reason after
`--`, and no tool checked it. v1 had disables of `no-barrel-file`, `no-explicit-any`, and
`no-unsafe-return` without a reason, and two `no-console` disables that used a single `-`. We
decided (2026-10-29, issue #546) that the `strict` preset turns on a first-party rule,
`adamantite/require-suppression-reason`, which reports an `oxlint-disable` or `eslint-disable`
comment, and its `-line` and `-next-line` forms, without a reason.

Oxlint 1.88 has no native rule for this: it has no port of `eslint-comments/require-description`.
`typescript/ban-ts-comment` in core already requires a description on `@ts-expect-error`, and
`unicorn/no-abusive-eslint-disable` in core reports a disable comment that names no rule. So the
new rule checks only the comments that name rules. A comment that names no rule turns off every
rule in its range, this rule too, so only a native rule can report it.

The rule reads the reason as ESLint and Oxlint read a directive description: the text after two
or more dashes with white space on both sides. A single `-` is part of the rule list, so the rule
reports it. An `-enable` comment needs no reason.

The rule goes in `strict`, not core, because core enables only native rules while Oxlint JS
plugins are alpha (ADR 0010).

## Considered options

- **A native rule in core.** Oxlint has none, so this waits for an upstream port.
- **A custom rule in each project.** This is the duplication that issue #524 removes.

## Consequences

- A project that selects `strict` gets a report on each suppression without a reason after the
  update. The repair is a reason, or a fix to the code that removes the suppression.
- A reason is free text, so the rule cannot tell a good reason from a bad one. Review still
  judges the reason.

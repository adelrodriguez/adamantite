# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues. Use the `gh` CLI for all
operations.

## Repository

`adelrodriguez/adamantite`

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
- Read: `gh issue view <number> --comments`.
- List: `gh issue list`.
- Comment: `gh issue comment <number> --body "..."`.
- Label: `gh issue edit <number> --add-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Infer the repository from the Git remote when possible.

## Implementation plans

A plan lives in the body of the issue that it serves, not in a repository file. Put the
decisions, the steps, and a task list there, and edit the body with
`gh issue edit <number> --body-file <file>` when the plan changes. Use a comment only to
record why a plan changed. If the work has no issue, create one for it.

## Pull requests as a request surface

PRs as a request surface: no.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When a skill says
to fetch a ticket, read the GitHub issue and its comments. Use GitHub sub-issues and native
dependencies for wayfinding when available.

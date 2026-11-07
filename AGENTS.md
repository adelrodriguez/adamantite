# AGENTS.md

Use ASD-STE100 Simplified Technical English for all communication.

Before you explore or change code, read [GLOSSARY.md](GLOSSARY.md) and the relevant parts of
[docs/architecture.md](docs/architecture.md). Use the project's domain language.

Read [CODING_STANDARDS.md](CODING_STANDARDS.md) before you write or review code.

For terminal output and interaction, read [DESIGN.md](DESIGN.md).

## Agent skills

### Source references

When a skill requires a local dependency source checkout, use Packref. Add the package
with `pnpm dlx packref add <package>` and read its version-locked source under
`.packref/packages/`.

### Issue tracker

Issues and PRDs are GitHub issues at `adelrodriguez/adamantite`. See
[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Use the default five-role triage vocabulary. See
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Use the single-context domain-doc layout. See [docs/agents/domain.md](docs/agents/domain.md).

### Changesets

Use Changesets for versioning and changelog management. See
[docs/agents/changesets.md](docs/agents/changesets.md).

### Implementation plans

Write an implementation plan into the GitHub issue that it serves. Update the issue body
when the plan changes, so the issue stays the single record of the work. Do not add plan
files to the repository. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

## Development workflow

Use pnpm for package management and scripts. Read
[CONTRIBUTING.md](CONTRIBUTING.md#validate-a-change) for setup, validation, and pull requests.

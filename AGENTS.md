# AGENTS.md

Before you explore or change code, read [GLOSSARY.md](GLOSSARY.md) and the relevant parts of
[docs/architecture.md](docs/architecture.md). Use the project's domain language.

Read [CODING_STANDARDS.md](CODING_STANDARDS.md) before you write or review code.

For terminal output and interaction, read [DESIGN.md](DESIGN.md).

## What is Adamantite

Adamantite is an agent-first set of presets and a CLI that keep modern TypeScript codebases at
high quality. Its purpose is to help coding agents write excellent code. Apply these principles
to every change:

- **Enforce strict standards.** Adamantite is highly opinionated. Its presets set high standards
  that agents must follow, and a check fails when code breaks them.
- **Embrace breaking changes.** Make the change that improves the standard, even when it breaks
  target projects. Make the update easy for agents instead, with a Doctor finding that gives the
  migration or a changeset that names the replacement.
- **Instruct agents instead of building analysis.** Keep programmatic and static analysis in
  setup and updates to a minimum. Give agents the guidance to do the work, as `doctor` and
  `harden` do: each renders a prompt for an agent and does not repair the project itself. See
  [ADR 0002](docs/adr/0002-doctor-instructs-agents-mutate.md) and
  [ADR 0012](docs/adr/0012-harden-instructs-agents-to-write-rules.md). Design for the
  capabilities that new agents gain.
- **Tighten, do not loosen.** Move the presets toward stricter rules. Do not turn off a rule or
  widen its options to make code pass.
- **Make the tools work together.** Adamantite's value is that Oxlint, Oxfmt, TypeScript, Knip,
  Sherif, and their plugins work as one toolchain. Focus tests on how the tools combine, such as
  the stack tests that lint each fixture with every preset of its stack.
- **Do not test what a tool already tests.** Do not write a test that only proves the behavior of
  Oxlint, Knip, Effect, or another tool. Test Adamantite's configuration and its integrations.
- **Use Effect to its maximum.** When Effect offers a module or an option for a task, use it
  instead of a platform API or a custom helper.

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

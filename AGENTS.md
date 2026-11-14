# AGENTS.md

## What is Adamantite

Adamantite is an agent-first set of presets and a CLI that keep modern TypeScript codebases at high quality. It exists to help coding agents write excellent code. Every change follows these principles:

- **Enforce strict standards.** The presets are highly opinionated. A check fails when code breaks a standard, so agents must follow it.
- **Embrace breaking changes.** Make the change that improves a standard, even when it breaks target projects. Make the update easy for agents with a Doctor finding that gives the migration, or a changeset that names the replacement.
- **Guide agents instead of building analysis.** Keep programmatic and static analysis in setup and updates to a minimum, and give agents the instructions to do the work. For example, `doctor` and `harden` render a prompt for an agent and do not repair the project, as [ADR 0002](docs/adr/0002-doctor-instructs-agents-mutate.md) and [ADR 0012](docs/adr/0012-harden-instructs-agents-to-write-rules.md) record. Design for the capabilities that new agents gain.
- **Tighten, do not loosen.** Move the presets toward stricter rules. Do not turn off a rule or widen its options to make code pass. Turn off a rule only for a reason that you verified, and document the reason beside the rule. When the rule waits for an upstream fix, link the issue that tracks the fix and say when to turn the rule on again, as the `consistent-test-it` comment in `presets/lint/vitest.ts` does.
- **Make the tools work together.** Oxlint, Oxfmt, TypeScript, Knip, Sherif, and their plugins must work as one toolchain. Focus tests on how the tools combine, such as the stack tests that lint each fixture with every preset of its stack.
- **Do not test what a tool already tests.** Test Adamantite's configuration and integrations, not the behavior of Oxlint, Knip, Effect, or another tool.
- **Use Effect to its maximum.** When Effect offers a module or an option for a task, use it instead of a platform API or a custom helper.

## Read before you work

- Before you explore or change code, read [GLOSSARY.md](GLOSSARY.md) and the relevant parts of [docs/architecture.md](docs/architecture.md).
- Before you write or review code, read [CODING_STANDARDS.md](CODING_STANDARDS.md).
- Before you change terminal output, prompts, or menus, read [DESIGN.md](DESIGN.md).
- Before you validate a change or open a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md#validate-a-change). Run scripts with pnpm.

## Agent skills

### Source references

When a skill needs the source of a dependency, run `pnpm dlx packref add <package>` and read its version-locked source under `.packref/packages/`.

### Issue tracker

Issues, PRDs, and implementation plans are GitHub issues at `adelrodriguez/adamantite`. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

Use the default five-role triage vocabulary. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Use the single-context domain-doc layout. See [docs/agents/domain.md](docs/agents/domain.md).

### Changesets

Before you finish a change, decide whether it needs a changeset. See [docs/agents/changesets.md](docs/agents/changesets.md).

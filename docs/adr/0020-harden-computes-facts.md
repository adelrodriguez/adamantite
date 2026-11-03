# Harden computes facts, and the prompt keeps judgment

`adamantite harden` teaches the enforcement ladder: a type or a tool first, an instruction last.
Its own prompt grew one paragraph each time an agent missed a step (#597 to #601). Some of these
paragraphs taught mechanical work: how to copy the project for a trial, how to change the
Oxlint config of the right package, how to count suppressions, and how to lint the files of each
override. An agent can do each step wrong, and the prompt could only warn it. We decided
(2026-11-01) to apply the ladder to the prompt: each fact that the program can compute, the
program computes. See [#607](https://github.com/adelrodriguez/adamantite/issues/607).

The decisions:

- `adamantite rule try` runs a trial. It copies the files that git lists to a temporary folder,
  puts a trial config in place of the config that lints the cases, lints the cases, and deletes
  the copy. The project stays unchanged.
- Oxlint runs from the root of the copy, as a project lint does. The trial config takes the name
  of the config that it replaces, and imports that config under a new name. So the root config
  gives the options that only a root config can set, such as `typeAware`, and the nearest config
  gives the rules of each case.
- A report counts only when it comes from the plugin and the name of the rule, as Oxlint resolves
  them. Oxlint prints the config of an empty folder that turns on the rule, and names the rule as
  it reports it: `@typescript-eslint/no-explicit-any` as `typescript/no-explicit-any`, and
  `typescript/no-restricted-imports` as `no-restricted-imports`. A rule that this config cannot
  load is a rule of a JS plugin, and keeps its name.
- A link in `node_modules` to a workspace package goes to the copy of the package, so a config
  that imports a shared tooling package loads the copied rules. The copy of a linked package also
  has the files that git ignores in it, outside `node_modules`, such as the build output that its
  `exports` name.
- The trial changes the config, not the command line. Oxlint ignores `-D` for a rule that does
  not exist and for a JS plugin rule. It also ignores a built-in rule whose plugin the config
  does not turn on, so the trial override turns on that plugin.
- `rule try` exits 0 when each case is as expected, 1 when a case is not, and 2 when the trial is
  not evidence: the rule does not exist, the config ignores a case, a case does not parse, or
  Oxlint fails. Exit 2 replaces the warning in the prompt that "a run without a report is not
  evidence". Oxlint does not check option keys, so the pair of a case that the rule must report
  and a case that it must accept stays the evidence for options.
- The harden prompt shows two more facts in its Context section: the disable comments of each
  rule in the files that Oxlint lints, and a mark for each file of an override that turns a rule
  off. The mark comes from a trial that removes the rule from that override only, so the setting
  of the earlier layers applies again and Adamantite does not resolve the rule options. A file
  that Oxlint did not lint, because the config ignores it or it does not parse, gets its own mark,
  and never the mark "no longer breaks the rule".
- Adamantite still does not resolve the effective Oxlint config, as ADR 0012 decided. Oxlint
  runs each trial. The override reader parses the config without running it, and it reads only
  the overrides that list their files as strings.
- The agent keeps the judgment: what a standard is, its step on the ladder, its score, and the
  approval.

## Consequences

- An override with a glob, such as `**/*.test.ts`, is a scope decision, so harden does not lint
  its files.
- When the project has an override that names its files, `harden` makes one copy and runs Oxlint
  one time before it shows the prompt.
- The trial and the two facts run Oxlint through the toolchain entry of ADR 0019, with the
  toolchain of the copy. So a trial works in a project with the `effect` preset, where a plain
  `oxlint` fails to load the config.
- The copy has the files that git lists. A file that git ignores, such as generated code, is not
  in the copy.

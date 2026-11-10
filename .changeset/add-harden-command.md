---
"adamantite": minor
---

Add `adamantite harden` to turn a project's coding standards into lint rules

`adamantite harden` prints a Markdown prompt for a coding agent. The agent finds the coding standards that the project follows, drops the ones that a tool already enforces, and puts each remaining one at the highest level of enforcement that works: a custom rule when a rule can check it, and a line in `CODING_STANDARDS.md` when no rule can. The agent writes nothing until you approve the candidates.

The prompt gives the agent these facts about the project:

- The Oxlint config, the rules folders that its `custom()` calls load, and the instruction files. In a monorepo, the prompt lists them for each workspace package, and lists a rules folder that several configs load only once.
- Each Markdown file that git tracks or does not ignore, except the changesets and the changelogs. The prompt marks the files that no chain of links or code-span paths from an `AGENTS.md` reaches, and each link to a missing file, and the agent reports them as discovery gaps.
- The fix commits in the last 200 commits, or in the number of commits that `--commits` gives. A mistake that two fixes correct, or that the code still repeats, becomes a candidate, and the code before and after a fix become the cases of its rule.
- The rules that the project already has, the disable comments of each rule, and the files that an override no longer needs. The agent reports the forms of a mistake that a rule misses, the files that an override glob misses, and the rules with many suppressions.

Each candidate has its scope, a case that the rule must report, and a case that the rule must accept. The agent tries each rule on its cases with `adamantite rule try`, scores the candidates, and shows only the strong ones. A candidate that needs your choice goes to a separate Decisions list. A new rule stays at `error`, and an Oxlint override turns it off for the files that break it.

In an interactive terminal, `harden` offers the same menu as `adamantite doctor`: hand off to an installed coding agent, copy the prompt, or do nothing. Without a terminal, it prints the prompt. After an agent session, `harden` runs Oxfmt and Oxlint as `adamantite check` does, and assesses the project as `adamantite doctor` does. It exits 1 and names the failed check when either one fails, or when the session added a link to a missing file. A copy of the prompt, or "do nothing", exits 0 without these checks.

`--path` limits the session to one package or folder, and fails for a folder outside the project. `harden` stops before it prints the prompt when the project does not install the Adamantite version that runs the command, because the prompt offers the presets and rules of that version. The Adamantite skill documents `harden`.

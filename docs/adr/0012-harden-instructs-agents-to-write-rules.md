# Harden instructs agents to turn coding standards into rules

A target project follows more coding standards than its tools enforce. Some are written in
instructions that no rule checks, and some exist only in the code. We decided (2026-10-20) to add
`adamantite harden`, which extends the model of
[ADR 0002](0002-doctor-instructs-agents-mutate.md) to coding standards: Adamantite detects
the relevant files and renders one Markdown prompt, a coding agent does the work, and
Adamantite verifies the result. See
[#526](https://github.com/adelrodriguez/adamantite/issues/526).

The decisions:

- The prompt tells the agent to find the standards that the instructions state and the patterns
  that the code follows, to drop each one that a tool already enforces, and to put each
  remaining one on the highest step of the enforcement ladder that works: a type or
  structure, a preset rule, an import rule, a custom rule, then an instruction in
  `CODING_STANDARDS.md`.
- The command has one mode. The agent shows the candidates and writes nothing until the
  user approves. When no human can approve, the agent stops at the candidates, so an
  unattended run is an audit. An audit mode and a `--fix` flag were rejected, because the
  approval already gives both. The cost is that no flag guarantees a run without writes in
  a terminal: the approval step and the agent's own permission prompts carry that
  guarantee.
- The agent, not Adamantite, decides which standards a tool already enforces. Adamantite
  does not resolve the effective Oxlint config.
- Instructions do not mark which standards are enforced. A standard that becomes a rule
  leaves the instructions, and the rule file gets a comment that states the standard and why it exists,
  so each standard has one source.
- When a new rule reports existing code, the agent lists the violations and sets the rule
  to `warn`: through the `rules` option of `custom()` for a custom rule, or in the config
  that turns on any other rule. A separate change fixes the code.
- Nothing changes before the approval, not even a sample file: the agent confirms what a
  tool enforces by linting a counterexample that the code already has.
- Harden is not part of Doctor. Doctor is a deterministic CI gate, and a harden session can
  give a different result on each run, so harden never produces findings. Its context and
  prompt live in `src/lib/hardening`, beside `assessment`, because hardening does not
  classify managed state against a goal.
- The name describes the result. `scan` was rejected because it describes only the first
  half of the work, and `codify` because it does not fit the brand.

## Consequences

- Without a terminal, `harden` prints the prompt and exits 0. The interactive handoff and
  the verification after a session reuse Doctor's resolution menu
  ([#529](https://github.com/adelrodriguez/adamantite/issues/529),
  [#531](https://github.com/adelrodriguez/adamantite/issues/531)).
- No unit test can show that an agent finds good standards. The command tests check the
  sections and paths of the prompt, and real projects check its quality.

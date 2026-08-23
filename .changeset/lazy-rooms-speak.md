---
"adamantite": minor
---

Make `adamantite doctor` emit verifiable repair findings and prompts instead of mutating projects. Interactive runs show formatted findings, then let the user copy one Markdown prompt or pass it to Claude Code or Codex. Non-interactive runs print the Markdown prompt directly. `update` now only updates managed dependencies. Keep `doctor --fix` as a one-release error stub, remove the deprecated `typecheck` alias, and require `pnpm-workspace.yaml` to define packages before treating a project as a monorepo.

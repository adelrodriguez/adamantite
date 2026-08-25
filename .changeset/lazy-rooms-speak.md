---
"adamantite": minor
---

Make `adamantite doctor` emit verifiable repair findings and prompts instead of mutating projects. Interactive runs show formatted findings and offer to copy one Markdown prompt. Non-interactive runs print the Markdown prompt directly so a calling agent can follow it. `update` now only updates managed dependencies. Keep `doctor --fix` as a one-release error stub, remove the deprecated `typecheck` alias, and require `pnpm-workspace.yaml` to define packages before treating a project as a monorepo.

Align the pinned Effect packages on `4.0.0-rc.112` so the published CLI installs one compatible runtime.

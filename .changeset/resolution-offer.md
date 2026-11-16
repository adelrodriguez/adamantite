---
"adamantite": minor
---

Exit 1 from `init` and `update` when findings remain, and offer their repair through the resolution menu

`adamantite update` used to print the findings that remained after the setup and exit 0, and `adamantite init` did not assess the project. Both now exit 1 while findings remain. In an interactive terminal they offer the same resolution menu as `adamantite doctor`: a handoff to an installed coding agent, a copy of the repair prompt, or nothing. After a handoff they assess the project again and exit 0 only when no findings remain. Without a terminal they print the Markdown repair prompt. A CI job that runs `update` and accepts findings now fails, so run `adamantite doctor` to read them, or repair them first.

Every command that hands a prompt to an agent now uses one flow. When the agent CLI does not start, the command prints and copies the prompt instead of asking whether to copy it. `adamantite doctor` reports a project that does not declare `adamantite` with the new `adamantite-not-installed` finding instead of a message. `adamantite harden` reports a missing install, another installed version, and a `--path` outside the project once on standard error, as other failures are.

---
"adamantite": patch
---

Doctor now parses the Adamantite GitHub Actions workflow as YAML. It reads the `run` of each job
step, the `command` of each matrix `include` entry, and the `node-version` input of each step, so
it also finds a step in flow style, such as `- { name: Check, run: pnpm run check }`, and it
ignores text in comments. Doctor treats a workflow that does not parse as a workflow that runs no
commands. Adamantite also parses `pnpm-workspace.yaml` as YAML to find the workspace packages.
Adamantite now depends on `effect` 4.0.7, whose YAML parser keeps tabs in block scalars and reads
flow lists over several lines.

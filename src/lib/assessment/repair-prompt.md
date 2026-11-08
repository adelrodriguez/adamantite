# Adamantite doctor findings

Repair the findings below for the target project that uses Adamantite {{version}}.
Total findings: {{findingCount}}.

1. If the project has `AGENTS.md`, read it and the instructions it names. Inspect the current files for each finding.
   Continue when each finding's current state is confirmed, or rerun Doctor if the state has changed.
2. Meet every finding's goal and preserve the settings its notes protect. Merge reference settings into the existing configuration.
   For example, add a required plugin entry without replacing the project's other plugins.
   Fix the cause of each finding. Do not suppress checks or add workarounds.
   Continue when each goal is met or recorded as blocked with a reason. Keep unrelated project settings and code unchanged.

{{warnings}}{{findings}}

## Verify

1. Run the project's installed `adamantite doctor` from the project root through its package runner, such as `npx` or `pnpm exec`.
   Reread and resolve new findings until Doctor exits with code 0 and reports no findings.
   If a remaining goal is blocked, record the reason and stop the repair loop. Do not claim that the repair is complete.
   Record assessment warnings separately. Warnings alone can exit with code 0.
2. Run the project checks affected by the repairs and read their output.
   Continue when those checks pass, or record each failed or unavailable check without claiming a verified repair.
3. Report the repaired findings, changed files, commands, results, and any blocked goals or warnings.
   If a required tool or source was unavailable, name it on the first line and state what you used instead.
   The report is complete when every finding has a verified result or an explicit blocker.

## Check the repair

- Every finding's goal is met or has a reported blocker.
- Reference settings were merged, and unrelated project settings remain intact.
- Doctor reports no findings, or the report names every remaining finding.
- The report separates findings, warnings, and checks that could not be verified.

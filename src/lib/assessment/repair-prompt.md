# Adamantite doctor findings

This project uses Adamantite {{version}} to manage linting, formatting, and type tooling.
Total findings: {{findingCount}}. Resolve them so that `adamantite doctor` exits with code 0.

{{warnings}}{{findings}}

## Verify

Run `adamantite doctor` with your package runner, such as `npx` or `pnpm exec`, if it is not on PATH.
Resolve every finding above and check that Doctor exits with code 0.
Fix the cause of each finding. Do not suppress checks or add workarounds.

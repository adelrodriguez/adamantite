# Adamantite doctor findings

This project uses Adamantite {{version}} to manage linting, formatting, and type tooling.
`adamantite doctor` found {{findingCount}} issue(s). Fix them so that `adamantite doctor` exits 0.

{{warnings}}{{findings}}

## Verify

Run `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, if it is not on PATH.
All findings above must be gone and it must exit 0.
Do not suppress or work around checks; fix the underlying state.

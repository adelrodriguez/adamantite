---
"adamantite": minor
---

Rename the `shadcn` preset to `tailwind`

Replace imports from `adamantite/lint/shadcn` with `adamantite/lint/tailwind`, and use
`--preset tailwind` in `adamantite init` commands. The old preset import and CLI option
are removed. The managed package stays `@shadcn/lint`, with the same `shadcn/*` rule names,
`settings.shadcn` keys, and rule behavior. Doctor reports the old preset import and gives
migration instructions without changing the config.

The Tailwind choice in init states that it installs `@shadcn/lint`.

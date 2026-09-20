---
"adamantite": minor
---

Add the `adamantite/lint/shadcn` preset, a vendored build of [@shadcn/lint](https://github.com/shadcn-ui/lint) for Tailwind v4 design systems. It enables `shadcn/no-restyle`, `shadcn/no-raw-colors`, `shadcn/no-arbitrary-values`, `shadcn/no-inline-styles`, `shadcn/no-unknown-classes`, and `shadcn/require-static-classes` at `error`, and needs no dependency beyond `adamantite` and `oxlint`. Select it with `adamantite init` or `--preset shadcn`. A project without `components.json` must set `settings.shadcn` in its Oxlint config.

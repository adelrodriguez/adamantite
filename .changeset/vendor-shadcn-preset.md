---
"adamantite": minor
---

Add the `adamantite/lint/shadcn` preset for Tailwind v4 design systems

A vendored build of [@shadcn/lint](https://github.com/shadcn-ui/lint), so it needs no package beyond `adamantite` and `oxlint`. shadcn/ui is not required. Select it in `adamantite init` or with `--preset shadcn`.

Enables `shadcn/no-restyle`, `shadcn/no-raw-colors`, `shadcn/no-arbitrary-values`, `shadcn/no-inline-styles`, `shadcn/no-unknown-classes`, and `shadcn/require-static-classes` at `error`. Layout classes such as `mt-4` and `w-[320px]` are allowed, and the component-owned rules are off under `**/components/ui/**`.

A project without `components.json` must set `settings.shadcn` in its Oxlint config.

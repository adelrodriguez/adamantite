---
"adamantite": minor
---

Add the `adamantite/lint/shadcn` preset for Tailwind v4 design systems

The preset enables the six [@shadcn/lint](https://github.com/shadcn-ui/lint) rules at `error`: `shadcn/no-restyle`, `shadcn/no-raw-colors`, `shadcn/no-arbitrary-values`, `shadcn/no-inline-styles`, `shadcn/no-unknown-classes`, and `shadcn/require-static-classes`. Layout classes such as `mt-4` and `w-[320px]` are allowed, and the component-owned rules are off under `**/components/ui/**`. shadcn/ui is not required.

`@shadcn/lint` is a managed plugin. Select the preset in `adamantite init` or with `--preset shadcn`, and `init` installs the pinned version. `adamantite doctor` reports a missing or outdated package, and `adamantite update` moves it with the other managed dependencies. If you add the preset to `oxlint.config.ts` by hand, install `@shadcn/lint` too.

The plugin finds components and the theme through `components.json`. Without that file it looks for components in `components/ui` or `src/components/ui` and discovers the stylesheet that imports Tailwind. Set `settings.shadcn.ui` in the Oxlint config when components live elsewhere.

Also updates `oxc-parser` to 0.150.0.

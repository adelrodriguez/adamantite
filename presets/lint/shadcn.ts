import type { OxlintConfig } from "oxlint"

// The shadcn plugin (https://github.com/shadcn-ui/lint) checks a Tailwind v4
// design system: components keep their own appearance, colors and sizes come
// from the theme, and every class is one Tailwind can generate. shadcn/ui is
// not required. Upstream publishes @shadcn/lint to npm, but the package
// declares ESLint and @typescript-eslint/parser as peers that only its ESLint
// use needs, so Adamantite ships a self-contained bundled build in
// vendor/shadcn/plugin.mjs — see vendor/shadcn/license.md for attribution and
// scripts/vendor-plugins.ts for how it is regenerated. The plugin starts
// vendor/shadcn/tailwind-worker.js, which loads the target project's own
// Tailwind, and reads component files with the oxc-parser that Adamantite
// depends on.
//
// The plugin finds components and the theme through components.json. A
// project without that file sets settings.shadcn in its own config.
//
// The specifier is an absolute path computed from this module's location so
// the bundled plugin loads regardless of how the consuming project resolves
// packages. The vendor files sit at the same relative location in the source
// tree and in the published dist tree. This module runs under whatever
// runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs.
const config: OxlintConfig = {
  jsPlugins: [
    {
      name: "shadcn",
      specifier: new URL("vendor/shadcn/plugin.mjs", import.meta.url).href,
    },
  ],
  overrides: [
    {
      // Upstream's setup for the component directory: components own their
      // appearance and need structural values such as `ring-[3px]`. A project
      // with another component directory adds the same override for it.
      files: ["**/components/ui/**"],
      rules: {
        "shadcn/no-arbitrary-values": "off",
        "shadcn/no-restyle": "off",
        "shadcn/require-static-classes": "off",
      },
    },
  ],
  rules: {
    // Upstream recommends the layout allowance for both rules: placement
    // classes such as `mt-4`, `w-full`, and `top-[3.25rem]` belong to the
    // caller, not to the component or the theme scale.
    "shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }],
    "shadcn/no-inline-styles": "error",
    "shadcn/no-raw-colors": "error",
    "shadcn/no-restyle": ["error", { allow: ["layout"] }],
    "shadcn/no-unknown-classes": "error",
    "shadcn/require-static-classes": "error",
  },
}

export default config

import type { OxlintConfig } from "oxlint"

// The shadcn plugin (https://github.com/shadcn-ui/lint) checks a Tailwind v4
// design system: components keep their own appearance, colors and sizes come
// from the theme, and every class is one Tailwind can generate. shadcn/ui is
// not required.
//
// @shadcn/lint is a managed plugin: it stays an npm package that the target
// project installs. `adamantite init` installs the pinned version when this
// preset is selected, and doctor and update keep it on that version. The bare
// specifier makes Oxlint resolve the package from the target project, so the
// preset needs no runtime API and works under every package manager.
//
// The plugin finds components and the theme through components.json. Without
// that file it looks in components/ui or src/components/ui and discovers the
// stylesheet that imports Tailwind. A project with components elsewhere sets
// settings.shadcn.ui in its own config.
const config: OxlintConfig = {
  jsPlugins: ["@shadcn/lint"],
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

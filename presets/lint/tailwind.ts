import type { OxlintConfig } from "oxlint"
import { PRESET, type PresetIdentity } from "../identity.ts"

const config: OxlintConfig = {
  [PRESET]: { module: "adamantite/lint/tailwind" } satisfies PresetIdentity,
  // Oxlint resolves a bare specifier from the target project, under every package manager.
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

import { defineConfig, type OxlintOverride } from "oxlint"
import antislop from "./presets/lint/antislop.ts"
import core, { ignorePatterns } from "./presets/lint/core.ts"
import node from "./presets/lint/node.ts"

/**
 * The `src/lib` layers, lowest first. A layer imports only from the ranks below it, so layers that
 * share a rank do not import each other.
 */
const LIB_LAYER_RANKS = [["shared"], ["workspace", "execution"], ["integrations"], ["assessment"]]

const TERMINAL_IMPORTS = {
  group: ["#terminal/*"],
  message:
    "Terminal interaction belongs to commands/ and index.ts; lib code returns data for commands to render.",
}

function restrictLibLayerImports(layer: string, rank: number): OxlintOverride {
  const forbidden = LIB_LAYER_RANKS.slice(rank)
    .flat()
    .filter((other) => other !== layer)
  const layerImports = {
    group: forbidden.map((other) => `#lib/${other}/**`),
    message: `\`${layer}\` imports only from lower lib layers. See "Lib layers" in docs/architecture.md.`,
  }

  return {
    files: [`src/lib/${layer}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: forbidden.length > 0 ? [TERMINAL_IMPORTS, layerImports] : [TERMINAL_IMPORTS] },
      ],
    },
  }
}

export default defineConfig({
  extends: [core, node, antislop],
  ignorePatterns: [
    ...ignorePatterns,
    // Vendored plugin bundles are entirely generated; see scripts/vendor-plugins.ts.
    "presets/lint/vendor/",
    // Rule fixtures break rules on purpose; see src/__tests__/presets/rule-fixtures.ts.
    "src/__tests__/presets/fixtures/",
  ],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  overrides: LIB_LAYER_RANKS.flatMap((layers, rank) =>
    layers.map((layer) => restrictLibLayerImports(layer, rank))
  ),
})

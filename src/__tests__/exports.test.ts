import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import { RETIRED_LINT_PRESETS } from "#lib/integrations/tooling/oxlint/presets.ts"
import { LEGACY_CUSTOM_RULES_MODULE } from "#lib/workspace/custom-rules/inspect.ts"
import packageJson from "../../package.json" with { type: "json" }
import readme from "../../README.md?raw"

const exportedImports = Object.keys(packageJson.exports).map(
  (subpath) => `adamantite${subpath.slice(1)}`
)

/**
 * The imports in the README table of public imports, such as `adamantite/rules/plugin`.
 */
function readDocumentedImports() {
  return readme
    .split("\n")
    .flatMap((line) => /^\| `(adamantite(?:\/[\w-]+)*)`/.exec(line)?.[1] ?? [])
}

describe("package exports", () => {
  it("publish exactly the imports in the README table", () => {
    expect(Array.sort(readDocumentedImports(), Order.String)).toStrictEqual(
      Array.sort(exportedImports, Order.String)
    )
  })

  it("keep removed and retired imports private, so Doctor can ask projects to migrate", () => {
    expect(
      [
        LEGACY_CUSTOM_RULES_MODULE,
        ...RETIRED_LINT_PRESETS.map((preset) => `adamantite/lint/${preset}`),
      ].filter((specifier) => exportedImports.includes(specifier))
    ).toStrictEqual([])
  })
})

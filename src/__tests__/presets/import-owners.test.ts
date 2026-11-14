import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import { describeModelFixtures, lintModel } from "./model-fixtures.ts"

// Each model is a small project with its own `package.json` files and an `import-owners.json`
// config fragment that turns on `adamantite/import-owners`.
const OPTIONS = {
  configFile: "import-owners.json",
  fixturesDir: join(import.meta.dirname, "fixtures/import-owners"),
  ruleCode: "adamantite(import-owners)",
}

describe("import-owners rule fixtures", () => {
  describeModelFixtures(OPTIONS)
})

function packageHint(index: number) {
  return `Owners: the \`adamantite/import-owners\` options in the Oxlint config at \`options[${index}]\`. Owner paths are relative to the package root.`
}

describe("import-owners reports", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-import-owners-"))

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  function lint(model: string) {
    return EffectArray.sortWith(
      lintModel(OPTIONS, tempDir, model),
      (report) => report.filename,
      Order.String
    )
  }

  it("name the option, and owner paths from the workspace root, in a monorepo", () => {
    expect(lint("pnpm-monorepo")).toStrictEqual([
      {
        filename: "apps/web/src/form.invalid.ts",
        message:
          "Only `packages/schema` may import `zod`. Use what the owner exports, or move this code into the owner. Owners: the `adamantite/import-owners` options in the Oxlint config at `options[0]`. Owner paths are relative to the workspace root.",
      },
    ])
  })

  it("name the option of each report, and owner paths from the package root, outside a workspace", () => {
    const owners = "`src/lib/workspace/project.ts` or `src/commands/rule.ts`"

    expect(lint("project-modules")).toStrictEqual([
      {
        filename: "src/commands/doctor.invalid.ts",
        message: `Only \`src/lib\` may import \`#lib/integrations/tooling\`. Use what the owner exports, or move this code into the owner. ${packageHint(1)}`,
      },
      {
        filename: "src/commands/harden.invalid.ts",
        message: `Only ${owners} may import \`readWorkspace\` from \`#lib/workspace/monorepo.ts\`. Use what the owner exports, or move this code into the owner. ${packageHint(0)}`,
      },
      {
        filename: "src/lib/workspace/scope.invalid.ts",
        message: `Only ${owners} may import \`readWorkspace\` from \`#lib/workspace/monorepo.ts\`. Use what the owner exports, or move this code into the owner. ${packageHint(0)}`,
      },
    ])
  })
})

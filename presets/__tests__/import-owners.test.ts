import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import {
  describeModelFixtures,
  lintModel,
  lintProject,
  type ModelReport,
} from "./model-fixtures.ts"

const OPTIONS = {
  configFile: "import-owners.json",
  fixturesDir: join(import.meta.dirname, "../../src/__tests__/presets/fixtures/import-owners"),
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

const LINKED_OWNERS = {
  config: {
    rules: {
      "adamantite/import-owners": [
        "error",
        { import: "./src/high", owners: ["src/owner.ts"] },
        { import: "@acme/ui", owners: ["src/owner.ts"] },
        { import: "dep", owners: ["src/owner.ts"] },
        { import: "#lib/db", owners: ["src/owner.ts"] },
      ],
    },
  },
  files: {
    "node_modules/.pnpm/dep@1.0.0/node_modules/dep/index.js": "export const dep = 1\n",
    "node_modules/.pnpm/dep@1.0.0/node_modules/dep/package.json":
      '{"name":"dep","type":"module","exports":"./index.js"}\n',
    "package.json":
      '{"type":"module","workspaces":["packages/*"],"imports":{"#lib/*":"./src/lib/*"}}\n',
    "packages/ui/index.ts": "export const button = 1\n",
    "packages/ui/package.json": '{"name":"@acme/ui","type":"module","exports":"./index.ts"}\n',
    "src/high/api.ts": "export const api = 1\n",
    "src/high/value.ts": "export const value = 1\n",
    "src/lib/db/query.ts": "export const query = 1\n",
    "src/low/base.ts": "export const low = 1\n",
    "src/low/dependency.ts": 'export { dep } from "dep"\n',
    "src/low/direct.ts": 'export { api } from "../high/api.ts"\n',
    "src/low/through-file-link.ts": 'export { value } from "./value-link.ts"\n',
    "src/low/through-folder-link.ts": 'export { api } from "./high-link/api.ts"\n',
    "src/low/through-renamed-link.ts": 'export { actual } from "../lib/db/alias.ts"\n',
    "src/low/through-root-link.ts": 'export { api } from "../../high-root-link/api.ts"\n',
    "src/low/through-unowned-link.ts": 'export { low } from "../../low-root-link/base.ts"\n',
    "src/low/workspace-package.ts": 'export { button } from "@acme/ui"\n',
    "src/other/actual.ts": "export const actual = 1\n",
    "src/owner.ts": [
      'export { api } from "./high/api.ts"',
      'export { value } from "./low/value-link.ts"',
      'export { button } from "@acme/ui"',
      'export { dep } from "dep"',
      "",
    ].join("\n"),
  },
  links: {
    "high-root-link": "src/high",
    "low-root-link": "src/low",
    "node_modules/@acme/ui": "../../packages/ui",
    "node_modules/dep": ".pnpm/dep@1.0.0/node_modules/dep",
    "src/lib/db/alias.ts": "../../other/actual.ts",
    "src/low/high-link": "../high",
    "src/low/value-link.ts": "../high/value.ts",
  },
  targets: ["src"],
}

function ownerReport(module: string, index: number) {
  return `Only \`src/owner.ts\` may import \`${module}\`. Use what the owner exports, or move this code into the owner. Owners: the \`adamantite/import-owners\` options in the Oxlint config at \`options[${index}]\`. Owner paths are relative to the workspace root.`
}

describe.each([
  { throughLink: false, title: "import-owners through symlinks, from the project folder" },
  { throughLink: true, title: "import-owners through symlinks, from a linked project folder" },
])("$title", ({ throughLink }) => {
  const reports: ModelReport[] = []

  beforeAll(() => {
    reports.push(...lintProject("adamantite(import-owners)", LINKED_OWNERS, { throughLink }))
  })

  function messagesOf(file: string) {
    return reports.flatMap((report) => (report.filename === file ? [report.message] : []))
  }

  it.each([
    {
      file: "src/low/direct.ts",
      messages: [ownerReport("./src/high", 0)],
      name: "report a direct import of `src/high/api.ts`, in the owned folder by its path",
    },
    {
      file: "src/low/through-folder-link.ts",
      messages: [ownerReport("./src/high", 0)],
      name: "report an import through the folder link `src/low/high-link`, in the owned folder by its real path `src/high/api.ts`",
    },
    {
      file: "src/low/through-file-link.ts",
      messages: [ownerReport("./src/high", 0)],
      name: "report an import through the file link `src/low/value-link.ts`, in the owned folder by its real path `src/high/value.ts`",
    },
    {
      file: "src/low/through-root-link.ts",
      messages: [ownerReport("./src/high", 0)],
      name: "report an import through the project root link `high-root-link`, in the owned folder by its real path `src/high/api.ts`",
    },
    {
      file: "src/low/through-renamed-link.ts",
      messages: [ownerReport("#lib/db", 3)],
      name: "report an import through the file link `src/lib/db/alias.ts`, in the owned alias folder by its link name, although its real path is `src/other/actual.ts`",
    },
    {
      file: "src/low/through-unowned-link.ts",
      messages: [],
      name: "accept an import through the project root link `low-root-link`, outside the owned folder by its real path `src/low/base.ts`",
    },
    {
      file: "src/low/workspace-package.ts",
      messages: [ownerReport("@acme/ui", 1)],
      name: "report the linked workspace package `@acme/ui` by its package name, with its path through `node_modules/@acme/ui`",
    },
    {
      file: "src/low/dependency.ts",
      messages: [ownerReport("dep", 2)],
      name: "report the pnpm dependency `dep` by its package name",
    },
    {
      file: "src/owner.ts",
      messages: [],
      name: "accept every import of the owner `src/owner.ts`, also through a link",
    },
  ])("$name", ({ file, messages }) => {
    expect(messagesOf(file)).toStrictEqual(messages)
  })

  it("report no file that the cases above do not name", () => {
    expect(new Set(reports.map((report) => report.filename))).toStrictEqual(
      new Set([
        "src/low/dependency.ts",
        "src/low/direct.ts",
        "src/low/through-file-link.ts",
        "src/low/through-folder-link.ts",
        "src/low/through-renamed-link.ts",
        "src/low/through-root-link.ts",
        "src/low/workspace-package.ts",
      ])
    )
  })
})

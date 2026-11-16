import type { Options } from "@oxlint/plugins"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import { describeModelFixtures, lintProject, type ModelReport } from "./model-fixtures.ts"

const REPO = join(import.meta.dirname, "../..")

function lint(options: Readonly<Options>) {
  const fixture = mkdtempSync(join(tmpdir(), "adamantite-layers-options-"))

  try {
    mkdirSync(join(fixture, "src/lib/workspace"), { recursive: true })
    writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n')
    writeFileSync(join(fixture, "src/lib/workspace/value.ts"), "export const value = 1\n")
    writeFileSync(
      join(fixture, "oxlint.config.json"),
      JSON.stringify({
        jsPlugins: [
          {
            name: "adamantite",
            specifier: pathToFileURL(join(REPO, "presets/lint/plugins/adamantite/index.ts")).href,
          },
        ],
        rules: { "adamantite/layers": ["error", ...options] },
      })
    )

    const result = spawnSync(
      join(REPO, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.json", "-f", "json", "src"],
      { cwd: fixture, encoding: "utf8" }
    )

    if (result.error) {
      throw result.error
    }

    return result
  } finally {
    rmSync(fixture, { force: true, recursive: true })
  }
}

describe("layers option validation in Oxlint", () => {
  it.each([
    { name: "old dependency arrays", options: [{ layers: { workspace: [] }, root: "src/lib" }] },
    { name: "missing imports", options: [{ layers: { lib: {} }, root: "src" }] },
    {
      name: "leaf settings without a child map",
      options: [{ layers: { lib: { ignore: ["**"], imports: [] } }, root: "src" }],
    },
    { name: "missing roots", options: [{ layers: {} }] },
    {
      name: "malformed nested imports",
      options: [
        {
          layers: { lib: { imports: [], layers: { workspace: { imports: "shared" } } } },
          root: "src",
        },
      ],
    },
  ])("reject $name with a nonzero exit", ({ options }) => {
    const result = lint(options)

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("Options validation failed")
  })
})

// Each model is a small project with its own `package.json` files and a `layers.json` config
// fragment that turns on `adamantite/layers`.
describe("layers rule fixtures", () => {
  describeModelFixtures({
    configFile: "layers.json",
    fixturesDir: join(import.meta.dirname, "../../src/__tests__/presets/fixtures/layers"),
    ruleCode: "adamantite(layers)",
  })
})

const PNPM_DEPENDENCY = {
  "node_modules/.pnpm/dep@1.0.0/node_modules/dep/index.js": "export const dep = 1\n",
  "node_modules/.pnpm/dep@1.0.0/node_modules/dep/package.json":
    '{"name":"dep","type":"module","exports":"./index.js"}\n',
}

// `src/high` imports `src/low`. Links give the higher layer other paths: a folder link in the lower
// layer, a source-file link, and a link in the project root. pnpm links `dep` into `node_modules`.
const LINKED_LAYERS = {
  config: {
    rules: {
      "adamantite/layers": [
        "error",
        { layers: { high: { imports: ["low"] }, low: { imports: [] } }, root: "src" },
      ],
    },
  },
  files: {
    ...PNPM_DEPENDENCY,
    "package.json": '{"type":"module"}\n',
    "src/high/api.ts": "export const api = 1\n",
    "src/high/through-root-link.ts": 'export { low } from "../../low-root-link/base.ts"\n',
    "src/high/value.ts": "export const value = 1\n",
    "src/low/base.ts": "export const low = 1\n",
    "src/low/dependency.ts": 'export { dep } from "dep"\n',
    "src/low/direct.ts": 'export { api } from "../high/api.ts"\n',
    "src/low/through-file-link.ts": 'export { value } from "./value-link.ts"\n',
    "src/low/through-folder-link.ts": 'export { api } from "./high-link/api.ts"\n',
    "src/low/through-root-link.ts": 'export { api } from "../../high-root-link/api.ts"\n',
  },
  links: {
    "high-root-link": "src/high",
    "low-root-link": "src/low",
    "node_modules/dep": ".pnpm/dep@1.0.0/node_modules/dep",
    "src/low/high-link": "../high",
    "src/low/value-link.ts": "../high/value.ts",
  },
  targets: ["src"],
}

// A workspace root with source, whose layer map at `.` holds the workspace package `packages/ui`.
// The package manager links the package into `node_modules/@acme/ui`.
const LINKED_WORKSPACE_PACKAGE = {
  config: {
    rules: {
      "adamantite/layers": [
        "error",
        { layers: { packages: { imports: [] }, src: { imports: [] } }, root: "." },
      ],
    },
  },
  files: {
    "package.json": '{"type":"module","workspaces":["packages/*"]}\n',
    "packages/ui/index.ts": "export const button = 1\n",
    "packages/ui/package.json": '{"name":"@acme/ui","type":"module","exports":"./index.ts"}\n',
    "src/package.ts": 'export { button } from "@acme/ui"\n',
    "src/relative.ts": 'export { button } from "../packages/ui/index.ts"\n',
  },
  links: { "node_modules/@acme/ui": "../../packages/ui" },
  targets: ["src"],
}

function layersHint(root: string) {
  return `Layer map: the \`adamantite/layers\` options for root \`${root}\` in the Oxlint config at \`options[0].layers\`.`
}

const UPWARD = `\`low\` cannot import \`high\`: it is a higher layer. Move the code that this file needs down to \`low\`, or move this file up to \`high\`. ${layersHint("src")}`

const SIBLING = `\`src\` cannot import \`packages\`: they are siblings. ${layersHint(".")}`

function messagesOf(reports: readonly ModelReport[], file: string) {
  return reports.flatMap((report) => (report.filename === file ? [report.message] : []))
}

// Each boundary is measured on real paths, except for a path through `node_modules`, so Oxlint must
// report the same files whether it reaches the project folder directly or through a linked folder.
describe.each([
  { throughLink: false, title: "layers through symlinks, from the project folder" },
  { throughLink: true, title: "layers through symlinks, from a linked project folder" },
])("$title", ({ throughLink }) => {
  const layers: ModelReport[] = []
  const workspace: ModelReport[] = []

  beforeAll(() => {
    layers.push(...lintProject("adamantite(layers)", LINKED_LAYERS, { throughLink }))
    workspace.push(...lintProject("adamantite(layers)", LINKED_WORKSPACE_PACKAGE, { throughLink }))
  })

  it.each([
    {
      file: "src/low/direct.ts",
      messages: [UPWARD],
      name: "report a direct import of `src/high/api.ts`, in the higher layer by its path",
    },
    {
      file: "src/low/through-folder-link.ts",
      messages: [UPWARD],
      name: "report an import through the folder link `src/low/high-link`, in the higher layer by its real path `src/high/api.ts`",
    },
    {
      file: "src/low/through-file-link.ts",
      messages: [UPWARD],
      name: "report an import through the file link `src/low/value-link.ts`, in the higher layer by its real path `src/high/value.ts`",
    },
    {
      file: "src/low/through-root-link.ts",
      messages: [UPWARD],
      name: "report an import through the project root link `high-root-link`, in the higher layer by its real path `src/high/api.ts`",
    },
    {
      file: "src/high/through-root-link.ts",
      messages: [],
      name: "accept an import through the project root link `low-root-link`, in the lower layer by its real path `src/low/base.ts`",
    },
    {
      file: "src/low/dependency.ts",
      messages: [],
      name: "accept the pnpm dependency `dep`, outside the map by its path through `node_modules`",
    },
  ])("$name", ({ file, messages }) => {
    expect(messagesOf(layers, file)).toStrictEqual(messages)
  })

  it("report no file that the cases above do not name", () => {
    expect(new Set(layers.map((report) => report.filename))).toStrictEqual(
      new Set([
        "src/low/direct.ts",
        "src/low/through-file-link.ts",
        "src/low/through-folder-link.ts",
        "src/low/through-root-link.ts",
      ])
    )
  })

  it.each([
    {
      file: "src/package.ts",
      messages: [],
      name: "accept the linked workspace package `@acme/ui`, outside the map by its path through `node_modules/@acme/ui`",
    },
    {
      file: "src/relative.ts",
      messages: [SIBLING],
      name: "report a relative import of `packages/ui/index.ts`, in the sibling layer by its path",
    },
  ])("$name", ({ file, messages }) => {
    expect(messagesOf(workspace, file)).toStrictEqual(messages)
  })
})

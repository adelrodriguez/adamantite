import { posix } from "node:path"
import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, it } from "vitest"
import {
  createLayersRule,
  findLowerRepairs,
  findMapErrors,
  findUpperRepairs,
  findViolation,
  listImportable,
  locate,
  type Modules,
  readLayersOptions,
  splitAtRoot,
} from "#presets/lint/plugin/rules/layers.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

// A fake of the file system: relative imports resolve from the importer, `#` imports from
// `/project/src`, and `#dep` to a package. `#missing/...` does not resolve. The fixture test covers
// the real resolver.
const MODULES: Modules = {
  findPackage: () => "/project",
  resolve: (importer, specifier) => {
    if (specifier.startsWith(".")) {
      return posix.join(posix.dirname(importer), specifier)
    }

    if (specifier === "#dep") {
      return "/project/node_modules/dep/index.js"
    }

    return specifier.startsWith("#") && !specifier.startsWith("#missing/")
      ? `/project/src/${specifier.slice(1)}`
      : undefined
  },
}

const LIB_LAYERS = {
  assessment: ["integrations"],
  execution: ["shared"],
  hardening: ["workspace", "execution"],
  integrations: ["workspace", "execution"],
  shared: [],
  workspace: ["shared"],
}

const LIB_OPTIONS = { layers: LIB_LAYERS, root: "src/lib" }

const APP_LAYERS = { features: ["shared"], routes: ["features"], shared: [] }

const APP_OPTIONS = {
  entries: ["*.tsx"],
  isolate: ["features", "routes"],
  layers: APP_LAYERS,
  root: "src",
}

const HINT = "Layer map: `adamantite/layers` options in the Oxlint config."

function readOptions(raw: Parameters<typeof readLayersOptions>[0][number]) {
  const options = readLayersOptions([raw])

  if (options === undefined) {
    throw new Error("The test options have no root or layers.")
  }

  return options
}

function lib(file: string) {
  return `/project/src/lib/${file}`
}

function app(file: string) {
  return `/project/src/${file}`
}

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
})

tester.run("layers", createLayersRule(MODULES), {
  invalid: [
    {
      code: 'import { run } from "#lib/execution/run.ts"',
      errors: [
        {
          column: 20,
          line: 1,
          message: `\`workspace\` cannot import \`execution\`: they are siblings. Move the code that both need down to \`shared\`, or move this file up to \`hardening\` or \`integrations\`. ${HINT}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { base } from "../integrations/base.ts"',
      errors: [
        {
          message: `\`shared\` cannot import \`integrations\`: it is a higher layer. Move the code that this file needs down to \`shared\`, or move this file up to \`integrations\`. ${HINT}`,
        },
      ],
      filename: lib("shared/errors.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { harden } from "../../../hardening/index.ts"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/nested/deep/file.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { assess } from "#lib/hardening/index.ts"',
      errors: [
        {
          message: `\`assessment\` cannot import \`hardening\`: they are siblings. Move the code that both need down to \`execution\` or \`workspace\`. ${HINT}`,
        },
      ],
      filename: lib("assessment/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import type { Finding } from "#lib/integrations/base.ts"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/types.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { type Finding } from "#lib/integrations/base.ts"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/types.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'export { base } from "#lib/integrations/base.ts"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'export * from "#lib/integrations/base.ts"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'const base = await import("#lib/integrations/base.ts")',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/lazy.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'type Finding = import("#lib/integrations/base.ts").Finding',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/types.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { cache } from "#lib/cache/index.ts"',
      errors: [
        {
          message: `\`src/lib/cache\` is in no layer. Add \`cache\` to the layer map, with the layers that it imports. ${HINT}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: "export const cache = new Map()",
      errors: [
        {
          column: 0,
          data: { folder: "cache", path: "src/lib/cache" },
          line: 1,
          messageId: "unmappedFolder",
        },
      ],
      filename: lib("cache/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [{ data: { path: "src/lib/index.ts" }, messageId: "unmappedFile" }],
      filename: lib("index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { signIn } from "#features/auth/sign-in.ts"',
      errors: [
        {
          message: `\`features/billing\` cannot import \`features/auth\`: units in \`features\` do not import each other. Move the code that both need down to \`shared\`, or compose them in \`routes\`. ${HINT}`,
        },
      ],
      filename: app("features/billing/checkout.ts"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { Settings } from "./settings.tsx"',
      errors: [
        {
          message: `\`routes/index\` cannot import \`routes/settings\`: units in \`routes\` do not import each other. Move the code that both need down to \`features\`. ${HINT}`,
        },
      ],
      filename: app("routes/index.tsx"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { router } from "../../router.tsx"',
      errors: [
        {
          message: `\`features/auth\` cannot import the entry \`router.tsx\`: no layer imports an entry. Move the code that it needs into a layer. ${HINT}`,
        },
      ],
      filename: app("features/auth/navigate.ts"),
      options: [APP_OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          message: `\`workspace\` imports \`shard\`, which is not a layer. ${HINT}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [{ layers: { shared: [], workspace: ["shard"] }, root: "src/lib" }],
    },
    {
      code: "export const value = 1",
      errors: [{ data: { name: "feature" }, messageId: "unknownIsolate" }],
      filename: app("features/auth/index.ts"),
      options: [{ isolate: ["feature"], layers: APP_LAYERS, root: "src" }],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          message: `The layer map has a cycle: \`shared\` → \`workspace\` → \`shared\`. Layers import in one direction. ${HINT}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [{ layers: { shared: ["workspace"], workspace: ["shared"] }, root: "src/lib" }],
    },
  ],
  valid: [
    {
      code: 'import { errors } from "#lib/shared/errors.ts"',
      filename: lib("workspace/files.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { files } from "#lib/workspace/files.ts"\nimport { run } from "#lib/execution/run.ts"',
      filename: lib("assessment/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { config } from "./config.ts"',
      filename: lib("integrations/tooling/knip/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import packageJson from "../../../package.json"\nimport { title } from "#terminal/title.ts"\nimport { Effect } from "effect"\nimport dep from "#dep"',
      filename: lib("shared/version.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { missing } from "#missing/integrations/base.ts"',
      filename: lib("shared/errors.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import type { Finding } from "#lib/integrations/base.ts"',
      filename: lib("workspace/types.ts"),
      options: [{ ...LIB_OPTIONS, ignoreTypes: true }],
    },
    {
      code: 'import { helpers } from "#lib/assessment/__tests__/helpers.ts"',
      filename: lib("workspace/__tests__/files.test.ts"),
      options: [{ ...LIB_OPTIONS, ignore: ["**/__tests__/**"] }],
    },
    {
      code: 'import { run } from "#lib/execution/run.ts"',
      filename: "/project/src/commands/run.ts",
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { signIn } from "./sign-in.ts"',
      filename: app("features/auth/index.ts"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { Form } from "./-components/form.tsx"',
      filename: app("routes/settings/index.tsx"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { auth } from "#features/auth/index.ts"\nimport { Settings } from "#routes/settings.tsx"',
      filename: app("router.tsx"),
      options: [APP_OPTIONS],
    },
  ],
})

describe("splitAtRoot", () => {
  const { root } = readOptions({ layers: {}, root: "apps/*/src" })

  it("splits a path below a root glob", () => {
    expect(splitAtRoot(root, "apps/web/src/features/auth/index.ts")).toStrictEqual({
      below: ["features", "auth", "index.ts"],
      root: "apps/web/src",
    })
  })

  it("leaves a path outside the root", () => {
    expect(splitAtRoot(root, "apps/web/scripts/build.ts")).toBeUndefined()
    expect(splitAtRoot(root, "apps/web/src")).toBeUndefined()
  })
})

describe("locate", () => {
  const options = readOptions(APP_OPTIONS)

  it.each([
    { below: "router.tsx", expected: { kind: "entry", path: "router.tsx" } },
    { below: "index.ts", expected: { kind: "unmappedFile", path: "src/index.ts" } },
    { below: "lib/x.ts", expected: { folder: "lib", kind: "unmappedFolder", path: "src/lib" } },
    { below: "shared/a/b.ts", expected: { kind: "layer", layer: "shared", unit: undefined } },
    { below: "features/auth/a.ts", expected: { kind: "layer", layer: "features", unit: "auth" } },
    {
      below: "routes/settings.tsx",
      expected: { kind: "layer", layer: "routes", unit: "settings" },
    },
  ])("locate $below", ({ below, expected }) => {
    expect(locate(options, "src", below.split("/"))).toStrictEqual(expected)
  })
})

describe("layer map", () => {
  it("imports transitively", () => {
    expect(listImportable(LIB_LAYERS, "assessment")).toStrictEqual(
      new Set(["assessment", "execution", "integrations", "shared", "workspace"])
    )
  })

  it.each([
    { from: "workspace", to: "execution", violation: "sibling" },
    { from: "integrations", to: "hardening", violation: "sibling" },
    { from: "assessment", to: "hardening", violation: "sibling" },
    { from: "shared", to: "assessment", violation: "upward" },
    { from: "assessment", to: "shared", violation: undefined },
    { from: "workspace", to: "workspace", violation: undefined },
  ])("report $from importing $to as $violation", ({ from, to, violation }) => {
    expect(
      findViolation(
        LIB_LAYERS,
        { kind: "layer", layer: from, unit: undefined },
        { kind: "layer", layer: to, unit: undefined }
      )
    ).toBe(violation)
  })

  it.each([
    { from: "workspace", lower: ["shared"], to: "execution", upper: ["hardening", "integrations"] },
    { from: "workspace", lower: ["workspace"], to: "assessment", upper: ["assessment"] },
    { from: "integrations", lower: ["execution", "workspace"], to: "hardening", upper: [] },
  ])("repair $from importing $to", ({ from, lower, to, upper }) => {
    expect(findLowerRepairs(LIB_LAYERS, from, to)).toStrictEqual(lower)
    expect(findUpperRepairs(LIB_LAYERS, from, to)).toStrictEqual(upper)
  })

  it("repairs two units of one layer outside that layer", () => {
    expect(findLowerRepairs(APP_LAYERS, "features", "features")).toStrictEqual(["shared"])
    expect(findUpperRepairs(APP_LAYERS, "features", "features")).toStrictEqual(["routes"])
  })

  it("finds no errors in a valid map", () => {
    expect(findMapErrors(LIB_LAYERS, new Set())).toStrictEqual([])
  })

  it("finds a layer that imports itself", () => {
    expect(findMapErrors({ shared: ["shared"] }, new Set())).toStrictEqual([
      { cycle: ["shared", "shared"], kind: "cycle" },
    ])
  })
})

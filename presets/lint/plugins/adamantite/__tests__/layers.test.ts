import { posix } from "node:path"
import { identity } from "effect/Function"
import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, expectTypeOf, it } from "vitest"
import {
  createLayersRule,
  findLowerRepairs,
  findMapErrors,
  findUpperRepairs,
  findViolation,
  listImportable,
  locate,
  type LayersOptions,
  type Modules,
  readLayersOptions,
  splitAtRoot,
} from "#presets/lint/plugins/adamantite/rules/layers.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const MODULES: Modules = {
  findPackage: () => "/project",
  identify: identity,
  resolve: (importer, specifier, mode, conditions) => {
    if (specifier === "#conditional") {
      return conditions.includes("development")
        ? "/project/src/lib/integrations/value.ts"
        : "/project/outside.ts"
    }

    if (specifier === "#dual") {
      return mode === "require"
        ? "/project/src/lib/integrations/value.cts"
        : "/project/src/lib/shared/value.ts"
    }

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

const LIB_OPTIONS = {
  layers: Object.fromEntries(
    Object.entries(LIB_LAYERS).map(([name, imports]) => [name, { imports }])
  ),
  root: "src/lib",
}

const APP_LAYERS = { features: ["shared"], routes: ["features"], shared: [] }

const APP_OPTIONS = {
  entries: ["*.tsx"],
  isolate: ["features", "routes"],
  layers: Object.fromEntries(
    Object.entries(APP_LAYERS).map(([name, imports]) => [name, { imports }])
  ),
  root: "src",
}

function hint(root: string, configPath = "options[0].layers") {
  return `Layer map: the \`adamantite/layers\` options for root \`${root}\` in the Oxlint config at \`${configPath}\`.`
}

const HINT = hint("src/lib")
const APP_HINT = hint("src")

const SRC_OPTIONS = {
  entries: ["cli.ts"],
  layers: {
    commands: { imports: ["terminal"] },
    lib: { imports: [] },
    terminal: { imports: ["lib"] },
  },
  root: "src",
}

function readOptions(raw: Parameters<typeof readLayersOptions>[0][number]) {
  const [options] = readLayersOptions([raw])

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
      code: 'import { value } from "#conditional"',
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/conditional.ts"),
      options: [{ ...LIB_OPTIONS, conditions: ["development"] }],
    },
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
    ...[
      "import(`#lib/integrations/base.ts`)",
      'import("#lib/integrations/base.ts" as string)',
      'import("#lib/integrations/base.ts" satisfies string)',
      'import("#lib/integrations/base.ts"!)',
      'import(<string>"#lib/integrations/base.ts")',
      'import(("#lib/integrations/base.ts" as const)!)',
    ].map((code) => ({
      code,
      errors: [{ column: 7, line: 1, messageId: "upward" }],
      filename: lib("workspace/lazy.ts"),
      options: [LIB_OPTIONS],
    })),
    ...[
      'const base = require("#lib/integrations/base.ts")',
      "const base = require(`#lib/integrations/base.ts`)",
      'import base = require("#lib/integrations/base.ts")',
      'export import base = require("#lib/integrations/base.ts")',
      'import type base = require("#lib/integrations/base.ts")',
      // A type named `require` leaves the runtime `require` in place.
      'type require = string\nconst base = require("#lib/integrations/base.ts")',
      'interface require {}\nconst base = require("#lib/integrations/base.ts")',
      'type require = string\nfunction load() {\n  return require("#lib/integrations/base.ts")\n}',
    ].map((code) => ({
      code,
      errors: [{ messageId: "upward" }],
      filename: lib("workspace/lazy.ts"),
      options: [LIB_OPTIONS],
    })),
    {
      // `require` resolves with the `require` condition, which selects a higher layer here.
      code: 'const value = require("#dual")',
      errors: [{ column: 22, line: 1, messageId: "upward" }],
      filename: lib("workspace/dual.ts"),
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
          data: {
            configPath: "options[0].layers",
            folder: "cache",
            path: "src/lib/cache",
            root: "src/lib",
          },
          line: 1,
          messageId: "unmappedFolder",
        },
      ],
      filename: lib("cache/index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          data: { configPath: "options[0].layers", path: "src/lib/index.ts", root: "src/lib" },
          messageId: "unmappedFile",
        },
      ],
      filename: lib("index.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { value } from "#lib/index.ts"',
      errors: [
        {
          data: { configPath: "options[0].layers", path: "src/lib/index.ts", root: "src/lib" },
          messageId: "unmappedFile",
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import { signIn } from "#features/auth/sign-in.ts"',
      errors: [
        {
          message: `\`features/billing\` cannot import \`features/auth\`: units in \`features\` do not import each other. Move the code that both need down to \`shared\`, or compose them in \`routes\`. ${APP_HINT}`,
        },
      ],
      filename: app("features/billing/checkout.ts"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { Settings } from "./settings.tsx"',
      errors: [
        {
          message: `\`routes/index\` cannot import \`routes/settings\`: units in \`routes\` do not import each other. Move the code that both need down to \`features\`. ${APP_HINT}`,
        },
      ],
      filename: app("routes/index.tsx"),
      options: [APP_OPTIONS],
    },
    {
      code: 'import { router } from "../../router.tsx"',
      errors: [
        {
          message: `\`features/auth\` cannot import the entry \`router.tsx\`: no layer imports an entry. Move the code that it needs into a layer. ${APP_HINT}`,
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
      options: [
        { layers: { shared: { imports: [] }, workspace: { imports: ["shard"] } }, root: "src/lib" },
      ],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          data: { configPath: "options[0].layers", name: "feature", root: "src" },
          messageId: "unknownIsolate",
        },
      ],
      filename: app("features/auth/index.ts"),
      options: [
        {
          isolate: ["feature"],
          layers: Object.fromEntries(
            Object.entries(APP_LAYERS).map(([name, imports]) => [name, { imports }])
          ),
          root: "src",
        },
      ],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          message: `The layer map has a cycle: \`shared\` → \`workspace\` → \`shared\`. Layers import in one direction. ${HINT}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [
        {
          layers: { shared: { imports: ["workspace"] }, workspace: { imports: ["shared"] } },
          root: "src/lib",
        },
      ],
    },
    {
      code: 'import { prompt } from "#terminal/prompter.ts"',
      errors: [
        {
          message: `\`lib\` cannot import \`terminal\`: it is a higher layer. Move the code that this file needs down to \`lib\`, or move this file up to \`terminal\`. ${APP_HINT}`,
        },
      ],
      filename: lib("shared/errors.ts"),
      options: [SRC_OPTIONS, LIB_OPTIONS],
    },
    {
      code: 'import { prompt } from "#terminal/prompter.ts"\nimport { base } from "#lib/integrations/base.ts"',
      errors: [
        { line: 1, messageId: "upward" },
        { line: 2, messageId: "upward" },
      ],
      filename: lib("shared/errors.ts"),
      options: [SRC_OPTIONS, LIB_OPTIONS],
    },
    {
      code: 'import { base } from "../integrations/base.ts"',
      errors: [
        {
          data: { configPath: "options[0].layers", folder: "lib", path: "src/lib", root: "src" },
          messageId: "unmappedFolder",
        },
        { line: 1, message: /^`shared` cannot import `integrations`/u },
      ],
      filename: lib("shared/errors.ts"),
      options: [{ ...SRC_OPTIONS, layers: { terminal: { imports: [] } } }, LIB_OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [
        {
          message: `\`workspace\` imports \`shard\`, which is not a layer. ${hint("src/lib", "options[1].layers")}`,
        },
      ],
      filename: lib("workspace/files.ts"),
      options: [
        SRC_OPTIONS,
        { layers: { shared: { imports: [] }, workspace: { imports: ["shard"] } }, root: "src/lib" },
      ],
    },
  ],
  valid: [
    {
      code: 'import { value } from "#conditional"',
      filename: lib("workspace/conditional.ts"),
      options: [LIB_OPTIONS],
    },
    ...[
      'const path = "#lib/integrations/base.ts"\nconst base = import(path)',
      'const base = import("#lib/integrations/" + "base.ts")',
      `const name = "base"\nconst base = import(\`#lib/integrations/\${name}.ts\`)`,
      'const base = import("#lib/shared/errors.ts", { with: { type: "#lib/integrations/base.ts" } })',
    ].map((code) => ({ code, filename: lib("workspace/lazy.ts"), options: [LIB_OPTIONS] })),
    ...[
      'function load(require: (path: string) => unknown) {\n  return require("#lib/integrations/base.ts")\n}',
      'const require = (path: string) => path\nrequire("#lib/integrations/base.ts")',
      'const path = require.resolve("#lib/integrations/base.ts")',
      "import Base = Integrations.Base",
    ].map((code) => ({ code, filename: lib("workspace/lazy.ts"), options: [LIB_OPTIONS] })),
    {
      code: 'const errors = require("#lib/shared/errors.ts")\nimport files = require("./files.ts")',
      filename: lib("workspace/lazy.ts"),
      options: [LIB_OPTIONS],
    },
    {
      code: 'import type base = require("#lib/integrations/base.ts")',
      filename: lib("workspace/lazy.ts"),
      options: [{ ...LIB_OPTIONS, ignoreTypes: true }],
    },
    {
      // `import` resolves with the `import` condition, which selects a lower layer here.
      code: 'import { value } from "#dual"\nconst lazy = import("#dual")',
      filename: lib("workspace/dual.ts"),
      options: [LIB_OPTIONS],
    },
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
      code: 'import dep from "#dep"\nimport { other } from "../../other/index.ts"',
      filename: "/project/shared/index.ts",
      options: [
        { layers: { features: { imports: ["shared"] }, shared: { imports: [] } }, root: "." },
      ],
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
    {
      code: 'import { run } from "#lib/execution/run.ts"\nimport { prompt } from "#terminal/prompter.ts"',
      filename: lib("hardening/index.ts"),
      options: [
        { ...SRC_OPTIONS, layers: { lib: { imports: ["terminal"] }, terminal: { imports: [] } } },
        LIB_OPTIONS,
      ],
    },
    {
      code: 'import { errors } from "#lib/shared/errors.ts"\nimport { prompt } from "#terminal/prompter.ts"',
      filename: app("commands/check.ts"),
      options: [SRC_OPTIONS, LIB_OPTIONS],
    },
  ],
})

describe("readLayersOptions", () => {
  it("exposes child maps as read-only maps", () => {
    expectTypeOf<LayersOptions["children"]>().toEqualTypeOf<ReadonlyMap<string, LayersOptions>>()
  })

  it("reads one map for each option object", () => {
    expect(
      readLayersOptions([SRC_OPTIONS, LIB_OPTIONS]).map((options) => options.rootGlob)
    ).toStrictEqual(["src", "src/lib"])
  })

  it("leaves out a map without root or layers", () => {
    expect(
      readLayersOptions([{ root: "src" }, { layers: {} }, LIB_OPTIONS]).map(
        (options) => options.rootGlob
      )
    ).toStrictEqual(["src/lib"])
  })
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

  it.each([
    { expected: "src/lib", relative: "src/lib/shared/use.ts" },
    { expected: "web/src/lib", relative: "web/src/lib/shared/use.ts" },
    { expected: "apps/web/src/lib", relative: "apps/web/src/lib/shared/use.ts" },
  ])("matches `**` to the folders above $expected", ({ expected, relative }) => {
    const globstar = readOptions({ layers: {}, root: "**/src/lib" }).root

    expect(splitAtRoot(globstar, relative)).toStrictEqual({
      below: ["shared", "use.ts"],
      root: expected,
    })
  })

  it("matches the whole package folder to the `.` root", () => {
    const { root: packageRoot } = readOptions({ layers: {}, root: "." })

    expect(splitAtRoot(packageRoot, "shared/use.ts")).toStrictEqual({
      below: ["shared", "use.ts"],
      root: "",
    })
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

  it("names an unmapped path below the `.` root from the package folder", () => {
    expect(locate(options, "", ["index.ts"])).toStrictEqual({
      kind: "unmappedFile",
      path: "index.ts",
    })
    expect(locate(options, "", ["lib", "x.ts"])).toStrictEqual({
      folder: "lib",
      kind: "unmappedFolder",
      path: "lib",
    })
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

const NESTED_MODULES: Modules = {
  findPackage: () => "/project",
  identify: identity,
  resolve: (importer, specifier, _mode, conditions) => {
    if (specifier === "#conditional") {
      return conditions.includes("development")
        ? "/project/src/lib/shared/value.ts"
        : "/project/src/lib/execution/run.ts"
    }

    if (specifier === "#other-app") {
      return "/project/apps/api/src/lib/execution/run.ts"
    }

    return specifier.startsWith(".") ? posix.resolve(posix.dirname(importer), specifier) : undefined
  },
}

const NESTED_LIB = {
  layers: {
    assessment: { imports: ["integrations"] },
    execution: { imports: ["shared"] },
    hardening: { imports: ["workspace", "execution"] },
    integrations: { imports: ["workspace", "execution"] },
    shared: { imports: [] },
    workspace: { imports: ["shared"] },
  },
}

const NESTED_OPTIONS = {
  layers: {
    commands: { imports: ["terminal"] },
    lib: { imports: [], ...NESTED_LIB },
    terminal: { imports: ["lib"] },
  },
  root: "src",
}

tester.run("nested layers", createLayersRule(NESTED_MODULES), {
  invalid: [
    {
      code: 'import { prompt } from "../../terminal/prompter.ts"\nimport { base } from "../integrations/base.ts"',
      errors: [
        { message: /root `src`.*`options\[0\]\.layers`/u },
        { message: /root `src\/lib`.*`options\[0\]\.layers\.lib\.layers`/u },
      ],
      filename: "/project/src/lib/shared/value.ts",
      options: [NESTED_OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, ignore: ["lib/**"] }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, entries: ["lib/**"] }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "cycle" }, { messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: { ...NESTED_OPTIONS.layers, lib: { ...NESTED_LIB, imports: ["terminal"] } },
        },
      ],
    },
    {
      code: 'import type { Run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, ignoreTypes: true }],
    },
    {
      code: 'import { value } from "../shared/value.ts"',
      errors: [{ messageId: "isolated" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, isolate: ["lib"] }],
    },
    {
      code: 'import { value } from "#conditional"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, conditions: ["development"] }],
    },
    {
      code: 'import { harden } from "../hardening/index.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/assessment/index.ts",
      options: [NESTED_OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, root: "." }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/apps/web/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, root: "apps/*/src" }],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "duplicateMap" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [NESTED_OPTIONS, { ...NESTED_LIB, root: "src/lib" }],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "unmappedFolder" }],
      filename: "/project/src/lib/cache/index.ts",
      options: [NESTED_OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "unknownImport" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: { lib: { imports: [], layers: { workspace: { imports: ["shard"] } } } },
        },
      ],
    },
    {
      code: 'import { compose } from "../compose.ts"',
      errors: [{ messageId: "entry" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: {
            ...NESTED_OPTIONS.layers,
            lib: { imports: [], ...NESTED_LIB, entries: ["compose.ts"] },
          },
        },
      ],
    },
    {
      code: 'import { value } from "../two/value.ts"',
      errors: [{ messageId: "isolated" }],
      filename: "/project/src/lib/workspace/one/value.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: {
            ...NESTED_OPTIONS.layers,
            lib: { imports: [], ...NESTED_LIB, isolate: ["workspace"] },
          },
        },
      ],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "unmappedFile" }],
      filename: "/project/src/lib/index.ts",
      options: [NESTED_OPTIONS],
    },
    {
      code: 'import { tool } from "../tooling/tool.ts"',
      errors: [{ messageId: "upward" }],
      filename: "/project/src/lib/integrations/base/value.ts",
      options: [
        {
          layers: {
            lib: {
              imports: [],
              layers: {
                integrations: {
                  imports: [],
                  layers: { base: { imports: [] }, tooling: { imports: ["base"] } },
                },
              },
            },
          },
          root: "src",
        },
      ],
    },
  ],
  valid: [
    {
      code: 'import { value } from "../shared/value.ts"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [NESTED_OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      filename: "/project/src/lib/workspace/ignored.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: {
            ...NESTED_OPTIONS.layers,
            lib: { imports: [], ...NESTED_LIB, ignore: ["**/ignored.ts"] },
          },
        },
      ],
    },
    {
      code: 'import type { Run } from "../execution/run.ts"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: {
            ...NESTED_OPTIONS.layers,
            lib: { imports: [], ...NESTED_LIB, ignoreTypes: true },
          },
        },
      ],
    },
    {
      code: 'import { value } from "#conditional"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: {
            ...NESTED_OPTIONS.layers,
            lib: { imports: [], ...NESTED_LIB, conditions: ["development"] },
          },
        },
      ],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      filename: "/project/src/feature/src/lib/workspace/project.ts",
      options: [
        {
          ...NESTED_OPTIONS,
          layers: { ...NESTED_OPTIONS.layers, feature: { imports: [] } },
          root: "**/src",
        },
      ],
    },
    {
      code: 'import { run } from "#other-app"',
      filename: "/project/apps/web/src/lib/workspace/project.ts",
      options: [{ ...NESTED_OPTIONS, root: "apps/*/src" }],
    },
  ],
})

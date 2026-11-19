import { constUndefined, identity } from "effect/Function"
import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, it } from "vitest"
import {
  createImportOwnersRule,
  isImportOf,
  readImportOwners,
} from "#presets/lint/plugins/adamantite/rules/import-owners.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const rule = createImportOwnersRule({
  findRoot: () => ({ kind: "workspace", path: "/project" }),
  identify: identity,
  resolve: constUndefined,
})

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

function hint(index: number) {
  return `Owners: the \`adamantite/import-owners\` options in the Oxlint config at \`options[${index}]\`. Owner paths are relative to the workspace root.`
}

const HINT = hint(0)

const ANCHOR = { configPath: "options[0]", root: "workspace root" }

const GIGET = { import: "giget", owners: ["src/lib/sources/repository/fetch.ts"] }
const ZOD = { import: "zod", owners: ["packages/utils"] }

const ALERT = {
  import: "react-native",
  names: ["Alert"],
  owners: ["apps/mobile/src/shared/alerts.ts", "apps/mobile/src/features/*/hooks.ts"],
}

const ALERT_OWNERS = "`apps/mobile/src/shared/alerts.ts` or `apps/mobile/src/features/*/hooks.ts`"

function file(path: string) {
  return `/project/${path}`
}

const MODULE_MESSAGE = `Only \`src/lib/sources/repository/fetch.ts\` may import \`giget\`. Use what the owner exports, or move this code into the owner. ${HINT}`

tester.run("import-owners", rule, {
  invalid: [
    {
      code: 'import { downloadTemplate } from "giget"',
      errors: [{ column: 33, line: 1, message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name: "report a static import outside the owner",
      options: [GIGET],
    },
    {
      code: 'import type { DownloadTemplateResult } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name: "report a type-only import outside the owner",
      options: [GIGET],
    },
    {
      code: 'export { downloadTemplate } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/index.ts"),
      name: "report a named re-export outside the owner",
      options: [GIGET],
    },
    {
      code: 'export * from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/index.ts"),
      name: "report export star outside the owner",
      options: [GIGET],
    },
    {
      code: 'const giget = await import("giget")',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name: "report a dynamic import outside the owner",
      options: [GIGET],
    },
    ...[
      { code: "import(`giget`)", name: "report a template literal dynamic import" },
      { code: 'import("giget" as string)', name: "report a dynamic import of a source under as" },
      {
        code: 'import("giget" satisfies string)',
        name: "report a dynamic import of a source under satisfies",
      },
      { code: 'import("giget"!)', name: "report a dynamic import of a non-null source" },
      {
        code: 'import(("giget" as const)!)',
        name: "report a dynamic import of a source under a const assertion and a non-null assertion",
      },
    ].map(({ code, name }) => ({
      code,
      errors: [{ column: 7, line: 1, message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name,
      options: [GIGET],
    })),
    {
      code: "const Native = await import(`react-native`)",
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a dynamic import that reaches a restricted name",
      options: [ALERT],
    },
    ...[
      { code: 'const giget = require("giget")', name: "report require" },
      { code: "const giget = require(`giget`)", name: "report require of a template literal" },
      { code: 'import giget = require("giget")', name: "report import-equals" },
      { code: 'export import giget = require("giget")', name: "report an exported import-equals" },
      { code: 'import type giget = require("giget")', name: "report a type-only import-equals" },
      // A type named `require` leaves the runtime `require` in place.
      {
        code: 'type require = string\nconst giget = require("giget")',
        name: "report require beside a type named require",
      },
      {
        code: 'interface require {}\nconst giget = require("giget")',
        name: "report require beside an interface named require",
      },
      {
        code: 'type require = string\nfunction load() {\n  return require("giget")\n}',
        name: "report require inside a function beside a type named require",
      },
    ].map(({ code, name }) => ({
      code,
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name,
      options: [GIGET],
    })),
    {
      // `require` reaches every export, as `import()` does, whatever the code destructures.
      code: 'const { View } = require("react-native")',
      errors: [{ column: 25, line: 1, messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a destructured require that reaches a restricted name",
      options: [ALERT],
    },
    {
      code: 'import Native = require("react-native")',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report an import-equals that reaches a restricted name",
      options: [ALERT],
    },
    {
      code: 'type Result = import("giget").DownloadTemplateResult',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      name: "report a type import outside the owner",
      options: [GIGET],
    },
    {
      code: 'import { downloadTemplate } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/sources/repository/fetch.test.ts"),
      name: "report an import in a file next to the owner file",
      options: [GIGET],
    },
    {
      code: 'import * as z from "zod/mini"',
      errors: [
        {
          message: `Only \`packages/utils\` may import \`zod\`. Use what the owner exports, or move this code into the owner. ${HINT}`,
        },
      ],
      filename: file("apps/web/src/form.ts"),
      name: "report a subpath of the module",
      options: [ZOD],
    },
    {
      code: 'import * as z from "zod"',
      errors: [{ messageId: "module" }],
      filename: file("packages/utils-extra/src/index.ts"),
      name: "report a folder whose name starts with the owner name",
      options: [ZOD],
    },
    {
      code: 'import { Alert, Text } from "react-native"',
      errors: [
        {
          column: 9,
          line: 1,
          message: `Only \`apps/mobile/src/shared/alerts.ts\` or \`apps/mobile/src/features/*/hooks.ts\` may import \`Alert\` from \`react-native\`. Use what the owner exports, or move this code into the owner. ${HINT}`,
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a restricted name beside an unrestricted name",
      options: [ALERT],
    },
    {
      code: 'import { Alert as NativeAlert } from "react-native"',
      errors: [
        {
          data: { ...ANCHOR, import: "react-native", name: "Alert", owners: ALERT_OWNERS },
          messageId: "name",
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a renamed restricted name",
      options: [ALERT],
    },
    {
      code: 'export { Alert } from "react-native"',
      errors: [
        {
          data: { ...ANCHOR, import: "react-native", name: "Alert", owners: ALERT_OWNERS },
          messageId: "name",
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a re-export of a restricted name",
      options: [ALERT],
    },
    {
      code: 'import * as Native from "react-native"',
      errors: [
        {
          message: `This import reaches \`Alert\` from \`react-native\`, which only \`apps/mobile/src/shared/alerts.ts\` or \`apps/mobile/src/features/*/hooks.ts\` may import. Import only the names that this file needs. ${HINT}`,
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a namespace import that reaches a restricted name",
      options: [ALERT],
    },
    {
      code: 'export * from "react-native"',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report export star that reaches a restricted name",
      options: [ALERT],
    },
    {
      code: 'type NativeAlert = import("react-native").Alert',
      errors: [
        {
          data: { ...ANCHOR, import: "react-native", name: "Alert", owners: ALERT_OWNERS },
          messageId: "name",
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a qualified type of a restricted name",
      options: [ALERT],
    },
    {
      code: 'type Static = import("react-native").Alert.AlertStatic',
      errors: [
        {
          data: { ...ANCHOR, import: "react-native", name: "Alert", owners: ALERT_OWNERS },
          messageId: "name",
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a qualified type under a restricted name",
      options: [ALERT],
    },
    {
      code: 'type Native = typeof import("react-native")',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a typeof import type",
      options: [ALERT],
    },
    {
      // A named star re-export holds the default export too.
      code: 'export * as Native from "react-native"',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a named export star that holds the default export",
      options: [{ ...ALERT, names: ["default"] }],
    },
    {
      code: 'import Native from "react-native"',
      errors: [
        {
          data: { ...ANCHOR, import: "react-native", name: "default", owners: ALERT_OWNERS },
          messageId: "name",
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a default import when the owners own the default export",
      options: [{ ...ALERT, names: ["default"] }],
    },
    {
      code: 'import { downloadTemplate } from "giget"\nimport * as z from "zod"',
      errors: [
        { line: 1, messageId: "module" },
        { line: 2, messageId: "module" },
      ],
      filename: file("src/index.ts"),
      name: "report each option on its own",
      options: [GIGET, ZOD],
    },
    {
      code: 'import { Alert } from "react-native"',
      errors: [{ messageId: "name" }],
      filename: file("apps/mobile/src/features/goals/components/row.tsx"),
      name: "report each option that restricts one module with its own anchor",
      options: [ALERT],
    },
    {
      code: 'import { Alert } from "react-native"\nimport * as Native from "react-native"',
      errors: [
        {
          line: 1,
          message: `Only ${ALERT_OWNERS} may import \`Alert\` from \`react-native\`. Use what the owner exports, or move this code into the owner. ${hint(0)}`,
        },
        {
          line: 1,
          message: `Only \`apps/mobile/src/native\` may import \`react-native\`. Use what the owner exports, or move this code into the owner. ${hint(1)}`,
        },
        {
          line: 2,
          message: `This import reaches \`Alert\` from \`react-native\`, which only ${ALERT_OWNERS} may import. Import only the names that this file needs. ${hint(0)}`,
        },
        {
          line: 2,
          message: `Only \`apps/mobile/src/native\` may import \`react-native\`. Use what the owner exports, or move this code into the owner. ${hint(1)}`,
        },
      ],
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "report a restricted name in a file that the owner glob does not match",
      options: [ALERT, { import: "react-native", owners: ["apps/mobile/src/native"] }],
    },
  ],
  valid: [
    {
      code: 'import { downloadTemplate } from "giget"',
      filename: file("src/lib/sources/repository/fetch.ts"),
      name: "accept an import in the owner file",
      options: [GIGET],
    },
    {
      code: "const giget = await import(`giget`)",
      filename: file("src/lib/sources/repository/fetch.ts"),
      name: "accept a template literal dynamic import in the owner file",
      options: [GIGET],
    },
    ...[
      {
        code: 'const name = "giget"\nconst giget = import(name)',
        name: "accept a dynamic import of a constant",
      },
      {
        code: 'const giget = import("gi" + "get")',
        name: "accept a dynamic import of a concatenation",
      },
      {
        code: `const name = "get"\nconst giget = import(\`gi\${name}\`)`,
        name: "accept a dynamic import of a template literal with an expression",
      },
      {
        code: 'const zod = import("zod", { with: { type: "giget" } })',
        name: "accept an import attribute that names the module",
      },
    ].map(({ code, name }) => ({
      code,
      filename: file("src/lib/references/add.ts"),
      name,
      options: [GIGET],
    })),
    ...[
      {
        code: 'function load(require: (name: string) => unknown) {\n  return require("giget")\n}',
        name: "accept a parameter named require",
      },
      {
        code: 'const require = (name: string) => name\nrequire("giget")',
        name: "accept a local function named require",
      },
      { code: 'const path = require.resolve("giget")', name: "accept require.resolve" },
    ].map(({ code, name }) => ({
      code,
      filename: file("src/lib/references/add.ts"),
      name,
      options: [GIGET],
    })),
    {
      code: 'const giget = require("giget")\nimport fetch = require("giget")',
      filename: file("src/lib/sources/repository/fetch.ts"),
      name: "accept require and import-equals in the owner file",
      options: [GIGET],
    },
    {
      code: 'import * as z from "zod/mini"',
      filename: file("packages/utils/src/schema/mini.ts"),
      name: "accept a subpath import in the owner folder",
      options: [ZOD],
    },
    {
      code: 'import * as z from "zod"',
      filename: file("packages/utils/src/schema/index.ts"),
      name: "accept an owner path that starts with ./",
      options: [{ ...ZOD, owners: ["./packages/utils/"] }],
    },
    {
      code: 'import { Gigeto } from "gigeto"',
      filename: file("src/index.ts"),
      name: "accept another package whose name starts with the module name",
      options: [GIGET],
    },
    {
      code: 'import { Alert } from "react-native"',
      filename: file("apps/mobile/src/shared/alerts.ts"),
      name: "accept a restricted name in an owner file",
      options: [ALERT],
    },
    {
      code: 'import { Alert } from "react-native"',
      filename: file("apps/mobile/src/features/goals/hooks.ts"),
      name: "accept a restricted name in an owner that a glob matches",
      options: [ALERT],
    },
    {
      code: 'import Native, { Text, View } from "react-native"\nexport { Pressable } from "react-native"',
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "accept names that the owners do not own",
      options: [ALERT],
    },
    {
      code: 'import { downloadTemplate } from "giget"',
      filename: file("src/index.ts"),
      name: "accept an import without options",
    },
    {
      // A qualified type reaches only the export that it names.
      code: 'type TextType = import("react-native").Text',
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "accept a qualified type of a name that the owners do not own",
      options: [ALERT],
    },
    {
      // `export *` does not re-export the default export.
      code: 'export * from "react-native"',
      filename: file("apps/mobile/src/app/index.tsx"),
      name: "accept export star when the owners own the default export",
      options: [{ ...ALERT, names: ["default"] }],
    },
  ],
})

describe("readImportOwners", () => {
  it("read one import and its owners from each option object, with the option's path", () => {
    expect(
      readImportOwners([GIGET, { import: "zod" }, { owners: ["src"] }, ALERT]).map((entry) => ({
        configPath: entry.configPath,
        import: entry.import,
        names: entry.names,
        owners: entry.owners,
      }))
    ).toStrictEqual([
      { configPath: "options[0]", import: "giget", names: undefined, owners: GIGET.owners },
      {
        configPath: "options[3]",
        import: "react-native",
        names: new Set(["Alert"]),
        owners: ALERT.owners,
      },
    ])
  })
})

describe("isImportOf", () => {
  it("match the module and its subpaths", () => {
    expect(isImportOf("zod", "zod")).toBe(true)
    expect(isImportOf("zod", "zod/mini")).toBe(true)
    expect(isImportOf("@tanstack/react-query", "@tanstack/react-query")).toBe(true)
  })

  it("not match another module whose name starts with the same text", () => {
    expect(isImportOf("zod", "zodiac")).toBe(false)
    expect(isImportOf("react-native", "react-native-web")).toBe(false)
    expect(isImportOf("@tanstack/react-query", "@tanstack/react-query-devtools")).toBe(false)
  })
})

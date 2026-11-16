import { constUndefined } from "effect/Function"
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

// Every file is in the project at `/project`, and no import resolves. The fixture tests cover the
// real workspace lookup and the resolution of project modules.
const rule = createImportOwnersRule({
  findRoot: () => ({ kind: "workspace", path: "/project" }),
  resolve: constUndefined,
})

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

function hint(index: number) {
  return `Owners: the \`adamantite/import-owners\` options in the Oxlint config at \`options[${index}]\`. Owner paths are relative to the workspace root.`
}

const HINT = hint(0)

// The message data that every report carries for the first option.
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
      options: [GIGET],
    },
    {
      code: 'import type { DownloadTemplateResult } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      options: [GIGET],
    },
    {
      code: 'export { downloadTemplate } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/index.ts"),
      options: [GIGET],
    },
    {
      code: 'export * from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/index.ts"),
      options: [GIGET],
    },
    {
      code: 'const giget = await import("giget")',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      options: [GIGET],
    },
    {
      code: 'type Result = import("giget").DownloadTemplateResult',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/references/add.ts"),
      options: [GIGET],
    },
    {
      // A file next to the owner file is not the owner.
      code: 'import { downloadTemplate } from "giget"',
      errors: [{ message: MODULE_MESSAGE }],
      filename: file("src/lib/sources/repository/fetch.test.ts"),
      options: [GIGET],
    },
    {
      // A subpath of the module belongs to the same owner.
      code: 'import * as z from "zod/mini"',
      errors: [
        {
          message: `Only \`packages/utils\` may import \`zod\`. Use what the owner exports, or move this code into the owner. ${HINT}`,
        },
      ],
      filename: file("apps/web/src/form.ts"),
      options: [ZOD],
    },
    {
      // A folder whose name starts with the owner's name is not the owner.
      code: 'import * as z from "zod"',
      errors: [{ messageId: "module" }],
      filename: file("packages/utils-extra/src/index.ts"),
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
      options: [ALERT],
    },
    {
      code: 'export * from "react-native"',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
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
      options: [ALERT],
    },
    {
      code: 'type Native = typeof import("react-native")',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
      options: [ALERT],
    },
    {
      // A named star re-export holds the default export too.
      code: 'export * as Native from "react-native"',
      errors: [{ messageId: "namespace" }],
      filename: file("apps/mobile/src/app/index.tsx"),
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
      options: [{ ...ALERT, names: ["default"] }],
    },
    {
      // Each option is checked on its own.
      code: 'import { downloadTemplate } from "giget"\nimport * as z from "zod"',
      errors: [
        { line: 1, messageId: "module" },
        { line: 2, messageId: "module" },
      ],
      filename: file("src/index.ts"),
      options: [GIGET, ZOD],
    },
    {
      code: 'import { Alert } from "react-native"',
      errors: [{ messageId: "name" }],
      filename: file("apps/mobile/src/features/goals/components/row.tsx"),
      options: [ALERT],
    },
    {
      // Each report names the option that produced it, when two options restrict one module.
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
      options: [ALERT, { import: "react-native", owners: ["apps/mobile/src/native"] }],
    },
  ],
  valid: [
    {
      code: 'import { downloadTemplate } from "giget"',
      filename: file("src/lib/sources/repository/fetch.ts"),
      options: [GIGET],
    },
    {
      code: 'import * as z from "zod/mini"',
      filename: file("packages/utils/src/schema/mini.ts"),
      options: [ZOD],
    },
    {
      // An owner path can start with `./`.
      code: 'import * as z from "zod"',
      filename: file("packages/utils/src/schema/index.ts"),
      options: [{ ...ZOD, owners: ["./packages/utils/"] }],
    },
    {
      // Another package whose name starts with the module's name.
      code: 'import { Gigeto } from "gigeto"',
      filename: file("src/index.ts"),
      options: [GIGET],
    },
    {
      code: 'import { Alert } from "react-native"',
      filename: file("apps/mobile/src/shared/alerts.ts"),
      options: [ALERT],
    },
    {
      code: 'import { Alert } from "react-native"',
      filename: file("apps/mobile/src/features/goals/hooks.ts"),
      options: [ALERT],
    },
    {
      // The owners own only `Alert`.
      code: 'import Native, { Text, View } from "react-native"\nexport { Pressable } from "react-native"',
      filename: file("apps/mobile/src/app/index.tsx"),
      options: [ALERT],
    },
    {
      code: 'import { downloadTemplate } from "giget"',
      filename: file("src/index.ts"),
    },
    {
      // A qualified type reaches only the export that it names.
      code: 'type TextType = import("react-native").Text',
      filename: file("apps/mobile/src/app/index.tsx"),
      options: [ALERT],
    },
    {
      // `export *` does not re-export the default export.
      code: 'export * from "react-native"',
      filename: file("apps/mobile/src/app/index.tsx"),
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

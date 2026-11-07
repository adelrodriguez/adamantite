import { posix } from "node:path"
import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import { createLayersRule, type Modules } from "#presets/lint/plugin/rules/layers.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const MODULES: Modules = {
  findPackage: () => "/project",
  resolve: (importer, specifier, conditions) => {
    if (specifier === "#conditional") {
      return conditions.includes("development")
        ? "/project/src/lib/shared/value.ts"
        : "/project/src/lib/execution/run.ts"
    }

    if (specifier === "#other-app") {
      return "/project/apps/api/src/lib/execution/run.ts"
    }

    return specifier.startsWith(".")
      ? posix.resolve(posix.dirname(importer), specifier)
      : undefined
  },
}

const LIB = {
  layers: {
    assessment: { imports: ["integrations"] },
    execution: { imports: ["shared"] },
    hardening: { imports: ["workspace", "execution"] },
    integrations: { imports: ["workspace", "execution"] },
    shared: { imports: [] },
    workspace: { imports: ["shared"] },
  },
}

const OPTIONS = {
  layers: {
    commands: { imports: ["terminal"] },
    lib: { imports: [], ...LIB },
    terminal: { imports: ["lib"] },
  },
  root: "src",
}

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" }, sourceType: "module" },
})

tester.run("nested layers", createLayersRule(MODULES), {
  invalid: [
    {
      code: 'import { prompt } from "../../../terminal/prompter.ts"\nimport { base } from "../integrations/base.ts"',
      errors: [{ messageId: "upward" }, { messageId: "upward" }],
      filename: "/project/src/lib/shared/value.ts",
      options: [OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, ignore: ["lib/**"] }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, entries: ["lib/**"] }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "cycle" }, { messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, layers: { ...OPTIONS.layers, lib: { ...LIB, imports: ["terminal"] } } }],
    },
    {
      code: 'import type { Run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, ignoreTypes: true }],
    },
    {
      code: 'import { value } from "../shared/value.ts"',
      errors: [{ messageId: "isolated" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, isolate: ["lib"] }],
    },
    {
      code: 'import { value } from "#conditional"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, conditions: ["development"] }],
    },
    {
      code: 'import { harden } from "../hardening/index.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/src/lib/assessment/index.ts",
      options: [OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/lib/workspace/project.ts",
      options: [{ ...OPTIONS, root: "." }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      errors: [{ messageId: "sibling" }],
      filename: "/project/apps/web/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, root: "apps/*/src" }],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "duplicateMap" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [OPTIONS, { ...LIB, root: "src/lib" }],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "unmappedFolder" }],
      filename: "/project/src/lib/cache/index.ts",
      options: [OPTIONS],
    },
    {
      code: "export const value = 1",
      errors: [{ messageId: "unknownImport" }],
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, layers: { lib: { imports: [], layers: { workspace: { imports: ["shard"] } } } } }],
    },
  ],
  valid: [
    {
      code: 'import { value } from "../shared/value.ts"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [OPTIONS],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      filename: "/project/src/lib/workspace/ignored.ts",
      options: [{ ...OPTIONS, layers: { ...OPTIONS.layers, lib: { imports: [], ...LIB, ignore: ["**/ignored.ts"] } } }],
    },
    {
      code: 'import type { Run } from "../execution/run.ts"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, layers: { ...OPTIONS.layers, lib: { imports: [], ...LIB, ignoreTypes: true } } }],
    },
    {
      code: 'import { value } from "#conditional"',
      filename: "/project/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, layers: { ...OPTIONS.layers, lib: { imports: [], ...LIB, conditions: ["development"] } } }],
    },
    {
      code: 'import { run } from "../execution/run.ts"',
      filename: "/project/src/feature/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, root: "**/src", layers: { ...OPTIONS.layers, feature: { imports: [] } } }],
    },
    {
      code: 'import { run } from "#other-app"',
      filename: "/project/apps/web/src/lib/workspace/project.ts",
      options: [{ ...OPTIONS, root: "apps/*/src" }],
    },
  ],
})

import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import {
  assessProject,
  type ProjectAssessment,
  renderAssessmentMarkdown,
} from "#lib/assessment/index.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeAssessment(value: Partial<ProjectAssessment>): ProjectAssessment {
  return {
    applicableIntegrations: ["tool"],
    findings: [],
    packageActions: [],
    warnings: [],
    ...value,
  }
}

describe("renderAssessmentMarkdown", () => {
  it("render one combined prompt with safety and verification instructions", () => {
    const prompt = renderAssessmentMarkdown(
      makeAssessment({
        findings: [
          {
            currentState: "`tool.config.ts` is missing.",
            goal: ["Create `tool.config.ts`.", "Preserve project settings."],
            id: "missing-tool-config",
            integration: "tool",
            notes: ["Do not replace custom rules."],
            reference: {
              content: '{ "extends": "adamantite/typescript" }\n',
              language: "json",
            },
            title: "Missing tool configuration",
          },
        ],
        warnings: ["Found two competing tool configurations."],
      }),
      "1.2.3"
    )

    expect(prompt).toBe(
      [
        "# Adamantite doctor findings",
        "",
        "This project uses Adamantite 1.2.3 to manage linting, formatting, and type tooling.",
        "`adamantite doctor` found 1 issue(s). Fix them so that `adamantite doctor` exits 0.",
        "",
        "## Assessment warnings",
        "",
        "Account for these warnings while fixing the findings:",
        "",
        "- Found two competing tool configurations.",
        "",
        "## 1. Missing tool configuration",
        "",
        "- **Current state:** `tool.config.ts` is missing.",
        "- **Goal:**",
        "  - Create `tool.config.ts`.",
        "  - Preserve project settings.",
        "- **Reference:**",
        "",
        "```json",
        '{ "extends": "adamantite/typescript" }',
        "```",
        "- **Notes:**",
        "  - Do not replace custom rules.",
        "",
        "## Verify",
        "",
        "Run `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, if it is not on PATH.",
        "All findings above must be gone and it must exit 0.",
        "Do not suppress or work around checks; fix the underlying state.",
        "",
      ].join("\n")
    )
  })

  it("omit the Notes section when a finding has no notes", () => {
    const prompt = renderAssessmentMarkdown(
      makeAssessment({
        findings: [
          {
            currentState: "`tool.config.ts` is missing.",
            goal: ["Create `tool.config.ts`."],
            id: "missing-tool-config",
            integration: "tool",
            notes: [],
            title: "Missing tool configuration",
          },
        ],
      }),
      "1.2.3"
    )

    expect(prompt).not.toContain("**Notes:**")
  })

  it("keep placeholder-like text in findings literal", () => {
    const prompt = renderAssessmentMarkdown(
      makeAssessment({
        findings: [
          {
            currentState: "The script runs `echo {{version}} $&`.",
            goal: ["Keep `{{findings}}` as written."],
            id: "literal-text",
            integration: "tool",
            title: "Literal text",
          },
        ],
      }),
      "1.2.3"
    )

    expect(prompt).toContain("- **Current state:** The script runs `echo {{version}} $&`.")
    expect(prompt).toContain("  - Keep `{{findings}}` as written.")
  })

  it("render the warning report when no findings remain", () => {
    const report = renderAssessmentMarkdown(
      makeAssessment({
        warnings: ["Skipping `tsconfig.json` setup.", "Skipping `.oxlintrc.json` setup."],
      }),
      "1.2.3"
    )

    expect(report).toBe(
      [
        "# Adamantite doctor warnings",
        "",
        "This project uses Adamantite 1.2.3 to manage linting, formatting, and type tooling.",
        "`adamantite doctor` found no repair findings, but reported these warnings:",
        "",
        "- Skipping `tsconfig.json` setup.",
        "- Skipping `.oxlintrc.json` setup.",
        "",
      ].join("\n")
    )
  })

  it("keep placeholder-like text in warnings literal", () => {
    const report = renderAssessmentMarkdown(
      makeAssessment({ warnings: ["The script runs `echo {{version}} {{warnings}} $&`."] }),
      "1.2.3"
    )

    expect(report).toContain("- The script runs `echo {{version}} {{warnings}} $&`.")
  })
})

describe("assessProject", () => {
  it.effect.each([
    { editor: "vscode", settings: "{}", finding: "vscode-oxlint-entry" },
    {
      editor: "vscode",
      settings: '{ "oxc.path.oxlint": "node_modules/oxlint/bin/oxlint" }',
      finding: "vscode-oxlint-entry",
    },
    {
      editor: "vscode",
      settings:
        '{ "oxc.path.oxlint": "${workspaceFolder}/node_modules/adamantite/dist/oxlint.js" }',
      finding: "vscode-oxlint-entry",
    },
    { editor: "vscode", settings: '{ "oxc.path.oxlint": false }', finding: "vscode-oxlint-entry" },
    {
      editor: "vscode",
      settings:
        '{ /* Project settings */ "oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js", }',
      finding: undefined,
    },
    { editor: "vscode", settings: undefined, finding: undefined },
    { editor: "zed", settings: "{}", finding: "zed-oxlint-entry" },
    {
      editor: "zed",
      settings: '{ "lsp": { "oxlint": { "binary": { "path": "oxlint" } } } }',
      finding: "zed-oxlint-entry",
    },
    {
      editor: "zed",
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js"] } } } }',
      finding: "zed-oxlint-entry",
    },
    {
      editor: "zed",
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp", "--fix"] } } } }',
      finding: "zed-oxlint-entry",
    },
    { editor: "zed", settings: '{ "lsp": false }', finding: "zed-oxlint-entry" },
    {
      editor: "zed",
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp"] } } } }',
      finding: undefined,
    },
    { editor: "zed", settings: undefined, finding: undefined },
  ])("assess $editor settings $settings without changing files", ({ editor, settings, finding }) =>
    Effect.gen(function* () {
      const settingsPath = `.${editor}/settings.json`
      const files = createFileSystemTestContext({
        files: {
          "package.json": "{}",
          ...(settings === undefined ? {} : { [settingsPath]: settings }),
        },
        root: ROOT,
      })
      const before = files.list().map((file) => [file, files.read(file)])
      files.makeReadOnly(ROOT)

      const assessment = yield* readProject(ROOT).pipe(
        Effect.flatMap((project) => assessProject(project)),
        Effect.provide([
          files.layer,
          Path.layer,
          makeModuleResolverLayer(ROOT),
          Layer.succeed(DependencyInstaller)({
            addDevDependencies: () => Effect.void,
            detectPackageManager: () => Effect.succeed({ name: "pnpm" }),
          }),
        ])
      )

      expect(
        assessment.findings.filter((entry) => entry.integration === editor).map(({ id }) => id)
      ).toStrictEqual(finding === undefined ? [] : [finding])
      expect(assessment.applicableIntegrations.includes(editor)).toBe(settings !== undefined)
      expect(files.list().map((file) => [file, files.read(file)])).toStrictEqual(before)
    })
  )

  it.effect("read the shared project facts one time for every integration", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ".adamantite/rules/no-foo.ts": "export default {}\n",
          ".github/workflows/adamantite.yml":
            "jobs:\n  check:\n    steps:\n      - run: pnpm run check\n",
          "oxlint.config.ts": [
            'import core from "adamantite/lint"',
            'import custom from "adamantite/lint/custom"',
            'import effect from "adamantite/lint/effect"',
            'import shadcn from "adamantite/lint/shadcn"',
            "export default { extends: [core, effect, shadcn, custom()] }",
            "",
          ].join("\n"),
          "package.json": yield* stringifyJson({
            devDependencies: { adamantite: "1.0.0" },
            scripts: {
              analyze: "adamantite analyze",
              check: "adamantite check",
              fix: "adamantite fix",
            },
          }),
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
          "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        },
        root: ROOT,
      })
      const reads: string[] = []
      const discoveries: string[] = []
      const fileSystem = Layer.effect(FileSystem.FileSystem)(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem

          return {
            ...fs,
            readFileString: (path: string, encoding?: string) => {
              reads.push(path)
              return fs.readFileString(path, encoding)
            },
          }
        })
      ).pipe(Layer.provide(files.layer))

      const assessment = yield* readProject(ROOT).pipe(
        Effect.flatMap((project) => assessProject(project)),
        Effect.provide([
          fileSystem,
          Path.layer,
          makeModuleResolverLayer(
            ROOT,
            {},
            Effect.sync(() => {
              discoveries.push("discovery")
            })
          ),
          Layer.succeed(DependencyInstaller)({
            addDevDependencies: () => Effect.void,
            detectPackageManager: () => Effect.succeed({ name: "pnpm" }),
          }),
        ])
      )

      expect(assessment.applicableIntegrations).toStrictEqual([
        "knip",
        "oxfmt",
        "oxlint",
        "oxlint-custom",
        "@shadcn/lint",
        "@effect/tsgo",
        "sherif",
        "tsrs",
        "tsconfig",
        "agents",
        "github",
      ])
      expect(reads.filter((path) => path === `${ROOT}/pnpm-workspace.yaml`)).toHaveLength(1)
      // The project reads the root config, and custom rule discovery reads it as an Oxlint config.
      expect(reads.filter((path) => path === `${ROOT}/oxlint.config.ts`)).toHaveLength(2)
      expect(discoveries).toHaveLength(1)
    })
  )
})

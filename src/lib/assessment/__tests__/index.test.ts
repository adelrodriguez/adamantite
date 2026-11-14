import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import {
  assessProject,
  type ProjectAssessment,
  renderAssessmentMarkdown,
} from "#lib/assessment/index.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

// These assessments resolve no TypeScript package, so the tsconfig integration starts no process.
const noProcessLayer = makeOxlintFilesLayer()

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
        "Repair the findings below for the target project that uses Adamantite 1.2.3.",
        "Total findings: 1.",
        "",
        "1. If the project has `AGENTS.md`, read it and the instructions it names. Inspect the current files for each finding.",
        "   Continue when each finding's current state is confirmed, or rerun Doctor if the state has changed.",
        "2. Meet every finding's goal and preserve the settings its notes protect. Merge reference settings into the existing configuration.",
        "   For example, add a required plugin entry without replacing the project's other plugins.",
        "   Fix the cause of each finding. Do not suppress checks or add workarounds.",
        "   Continue when each goal is met or recorded as blocked with a reason. Keep unrelated project settings and code unchanged.",
        "",
        "## Assessment warnings",
        "",
        "Review these warnings before making repairs:",
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
        "1. Run the project's installed `adamantite doctor` from the project root through its package runner, such as `npx` or `pnpm exec`.",
        "   Reread and resolve new findings until Doctor exits with code 0 and reports no findings.",
        "   If a remaining goal is blocked, record the reason and stop the repair loop. Do not claim that the repair is complete.",
        "   Record assessment warnings separately. Warnings alone can exit with code 0.",
        "2. Run the project checks affected by the repairs and read their output.",
        "   Continue when those checks pass, or record each failed or unavailable check without claiming a verified repair.",
        "3. Report the repaired findings, changed files, commands, results, and any blocked goals or warnings.",
        "   If a required tool or source was unavailable, name it on the first line and state what you used instead.",
        "   The report is complete when every finding has a verified result or an explicit blocker.",
        "",
        "## Check the repair",
        "",
        "- Every finding's goal is met or has a reported blocker.",
        "- Reference settings were merged, and unrelated project settings remain intact.",
        "- Doctor reports no findings, or the report names every remaining finding.",
        "- The report separates findings, warnings, and checks that could not be verified.",
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
        "Adamantite 1.2.3 detected no repair findings. The assessment reported these warnings:",
        "",
        "- Skipping `tsconfig.json` setup.",
        "- Skipping `.oxlintrc.json` setup.",
        "",
        "Review the affected project state before deciding whether a warning needs a change.",
        "Report each unresolved warning and the limit it places on verification.",
        "If a required tool or source was unavailable, name it on the first line and state what you used instead.",
        "The review is complete when each warning has an observed result or a stated limit.",
        "",
        "## Check the report",
        "",
        "- Every warning is accounted for, including missing tools or sources.",
        "- A successful Doctor exit is not reported as proof that all project checks pass.",
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
  it.effect.each([vscode, zed])(
    "clear the $name finding after the settings are repaired",
    (editor) =>
      Effect.gen(function* () {
        const settingsPath = `.${editor.name}/settings.json`

        const files = createFileSystemTestContext({
          files: {
            "package.json": "{}",
            [settingsPath]: '{ "projectSetting": true }',
          },
          root: ROOT,
        })

        const provideFiles = Effect.provide([
          files.layer,
          Path.layer,
          makeModuleResolverLayer(ROOT),
        ])

        const assess = Effect.gen(function* () {
          const project = yield* readProject(ROOT)

          return yield* editor.assess(project)
        }).pipe(provideFiles)

        expect(yield* assess).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("no value"),
              goal: [expect.stringContaining("Preserve every other setting")],
              id: `${editor.name}-oxlint-entry`,
              reference: {
                content: expect.stringContaining("node_modules/adamantite/dist/oxlint.js"),
                language: "json",
              },
            },
          ],
        })

        yield* editor.update(ROOT).pipe(provideFiles)

        expect(yield* assess).toMatchObject({ applicable: true, findings: [] })
        expect(files.read(settingsPath)).toContain('"projectSetting": true')
      })
  )

  it.effect.each([vscode, zed])("reject invalid $name settings", (editor) =>
    Effect.gen(function* () {
      for (const { content, error } of [
        { content: "[]", error: "InvalidConfigFormat" },
        { content: "{", error: "FailedToParseFile" },
      ]) {
        const files = createFileSystemTestContext({
          files: { "package.json": "{}", [`.${editor.name}/settings.json`]: content },
          root: ROOT,
        })

        const result = yield* Effect.gen(function* () {
          const project = yield* readProject(ROOT)

          return yield* editor.assess(project)
        }).pipe(
          Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)]),
          Effect.flip
        )

        expect(result).toMatchObject({ _tag: error })
      }
    })
  )

  it.effect.each([
    { editor: "vscode", finding: "vscode-oxlint-entry", settings: "{}" },
    {
      editor: "vscode",
      finding: "vscode-oxlint-entry",
      settings: '{ "oxc.path.oxlint": "node_modules/oxlint/bin/oxlint" }',
    },
    {
      editor: "vscode",
      finding: "vscode-oxlint-entry",
      settings: `{ "oxc.path.oxlint": "\${workspaceFolder}/node_modules/adamantite/dist/oxlint.js" }`,
    },
    { editor: "vscode", finding: "vscode-oxlint-entry", settings: '{ "oxc.path.oxlint": false }' },
    {
      editor: "vscode",
      finding: undefined,
      settings:
        '{ /* Project settings */ "oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js", }',
    },
    { editor: "vscode", finding: undefined, settings: undefined },
    { editor: "zed", finding: "zed-oxlint-entry", settings: "{}" },
    {
      editor: "zed",
      finding: "zed-oxlint-entry",
      settings: '{ "lsp": { "oxlint": { "binary": { "path": "oxlint" } } } }',
    },
    {
      editor: "zed",
      finding: "zed-oxlint-entry",
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js"] } } } }',
    },
    {
      editor: "zed",
      finding: "zed-oxlint-entry",
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp", "--fix"] } } } }',
    },
    { editor: "zed", finding: "zed-oxlint-entry", settings: '{ "lsp": false }' },
    {
      editor: "zed",
      finding: undefined,
      settings:
        '{ "lsp": { "oxlint": { "binary": { "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp"] } } } }',
    },
    { editor: "zed", finding: undefined, settings: undefined },
  ])("assess $editor settings $settings without changing files", ({ editor, settings, finding }) =>
    Effect.gen(function* () {
      const settingsPath = `.${editor}/settings.json`

      const files = createFileSystemTestContext({
        files: { "package.json": "{}" },
        root: ROOT,
      })

      if (settings !== undefined) {
        files.write(settingsPath, settings)
      }

      const before = files.list().map((file) => [file, files.read(file)])
      files.makeReadOnly(ROOT)

      const assessment = yield* readProject(ROOT).pipe(
        Effect.flatMap((project) => assessProject(project)),
        Effect.provide([
          files.layer,
          Path.layer,
          makeModuleResolverLayer(ROOT),
          noProcessLayer,
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
          ".adamantite/lint/no-foo.ts": "export default {}\n",
          ".github/workflows/adamantite.yml":
            "jobs:\n  check:\n    steps:\n      - run: pnpm run check\n",
          "oxlint.config.ts": [
            'import core from "adamantite/lint"',
            'import custom from "adamantite/rules"',
            'import effect from "adamantite/lint/effect"',
            'import tailwind from "adamantite/lint/tailwind"',
            "export default { extends: [core, effect, tailwind, custom()] }",
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
          "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
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
          noProcessLayer,
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
        "@effect/tsgo",
        "@shadcn/lint",
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

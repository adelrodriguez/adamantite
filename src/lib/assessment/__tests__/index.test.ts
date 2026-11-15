import { describe, expect, it } from "@effect/vitest"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import type { Selection } from "#lib/project/selection.ts"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { makeOxlintFilesLayer } from "#__tests__/oxlint-files.ts"
import {
  assessProject,
  type ProjectAssessment,
  renderAssessmentMarkdown,
} from "#lib/assessment/index.ts"
import { DependencyInstaller } from "#lib/project/dependency-installer.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { NodeVersionResolver } from "#lib/project/node-version-resolver.ts"
import { readProject } from "#lib/project/project.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

const EMPTY_SELECTION = {
  agents: false,
  ci: null,
  editors: [],
  presets: [],
  scripts: [],
  typescript: null,
} as const satisfies Selection

// The lockfile that `init` writes for `selection`, before it writes any managed file.
function makeLockfile(selection: Selection) {
  return stringifyJson({ schemaVersion: 1, selection, version: "0.0.0", written: {} })
}

// These assessments resolve no TypeScript package, so the tsconfig integration starts no process.
const noProcessLayer = makeOxlintFilesLayer()

type RenderedAssessment = Pick<ProjectAssessment, "findings" | "warnings">

function makeAssessment(value: Partial<RenderedAssessment>): RenderedAssessment {
  return { findings: [], warnings: [], ...value }
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
  ] as const)(
    "assess $editor settings $settings without changing files",
    ({ editor, settings, finding }) =>
      Effect.gen(function* () {
        const settingsPath = `.${editor}/settings.json`

        const files = createFileSystemTestContext({
          files: {
            [LOCKFILE_PATH]: yield* makeLockfile({
              ...EMPTY_SELECTION,
              editors: settings === undefined ? [] : [editor],
            }),
            "package.json": "{}",
          },
          root: ROOT,
        })

        if (settings !== undefined) {
          files.write(settingsPath, settings)
        }

        const before = files.list().map((file) => [file, files.read(file)])
        files.makeReadOnly(ROOT)

        const assessment = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => assessProject(project)),
          Effect.provide(
            withConfigLoader(
              Layer.mergeAll(
                files.layer,
                Path.layer,
                makeModuleResolverLayer(ROOT),
                noProcessLayer,
                Digest.layerWebCrypto,
                NodeVersionResolver.layer.pipe(Layer.provide([files.layer, Path.layer])),
                Layer.succeed(DependencyInstaller)({
                  addDevDependencies: () => Effect.void,
                  detectPackageManager: () => Effect.succeedSome({ name: "pnpm" }),
                })
              )
            )
          )
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
          [LOCKFILE_PATH]: yield* makeLockfile({
            ...EMPTY_SELECTION,
            ci: "github",
            presets: ["core", "effect", "tailwind"],
            scripts: ["analyze", "check", "fix"],
            typescript: "typescript",
          }),
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
        Effect.provide(
          withConfigLoader(
            Layer.mergeAll(
              fileSystem,
              Path.layer,
              makeModuleResolverLayer(ROOT),
              noProcessLayer,
              Digest.layerWebCrypto,
              NodeVersionResolver.layer.pipe(Layer.provide([files.layer, Path.layer])),
              Layer.succeed(DependencyInstaller)({
                addDevDependencies: () => Effect.void,
                detectPackageManager: () => Effect.succeedSome({ name: "pnpm" }),
              })
            )
          )
        )
      )

      expect(assessment.applicableIntegrations).toStrictEqual([
        "oxlint-custom",
        "@effect/tsgo",
        "@shadcn/lint",
        "tsrs",
        "oxlint",
        "oxfmt",
        "knip",
        "sherif",
        "tsconfig",
        "github",
      ])
      expect(reads.filter((path) => path === `${ROOT}/pnpm-workspace.yaml`)).toHaveLength(1)
      // The project loads the root config, and custom rule discovery loads it as the config of the
      // root package.
      expect(reads.filter((path) => path === `${ROOT}/oxlint.config.ts`)).toHaveLength(2)
    })
  )
})

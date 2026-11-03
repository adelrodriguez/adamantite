import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import agents from "#lib/integrations/workspace/agents.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
}

describe("agents", () => {
  describe("assess", () => {
    const packageJson = {
      scripts: { analyze: "adamantite analyze", check: "adamantite check" },
    }

    it.effect("report a missing AGENTS.md at the project root", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": yield* stringifyJson(packageJson) })
        const result = yield* readProject(ROOT, packageJson).pipe(
          Effect.flatMap((project) => agents.assess(project)),
          provideFiles(files)
        )

        expect(result).toStrictEqual({
          applicable: true,
          findings: [
            {
              currentState: "The project root has no `AGENTS.md`.",
              goal: [
                "Create `AGENTS.md` at the project root with the instructions that coding agents must follow in this project.",
                "Run `adamantite doctor` again. It must not report this finding.",
              ],
              id: "missing-agents-md",
              integration: "agents",
              notes: [
                "`AGENTS.md` is where coding agents start. It points to the other documentation of the project.",
                "To create the file with an Adamantite section that lists the package scripts, run `adamantite init --non-interactive --script analyze --script check --agents`.",
              ],
              title: "Missing AGENTS.md",
            },
          ],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect.each([
      { content: "# Project\n", name: "without an Adamantite section" },
      { content: "", name: "that is empty" },
    ])("accept an AGENTS.md $name", ({ content }) =>
      Effect.gen(function* () {
        const files = makeFiles({
          "AGENTS.md": content,
          "package.json": yield* stringifyJson(packageJson),
        })
        const result = yield* readProject(ROOT, packageJson).pipe(
          Effect.flatMap((project) => agents.assess(project)),
          provideFiles(files)
        )

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("check only the root of a monorepo", () =>
      Effect.gen(function* () {
        const monorepoPackageJson = { ...packageJson, workspaces: ["packages/*"] }
        const files = makeFiles({
          "AGENTS.md": "# Monorepo\n",
          "package.json": yield* stringifyJson(monorepoPackageJson),
          "packages/web/package.json": yield* stringifyJson({ name: "web" }),
        })
        const result = yield* readProject(ROOT, monorepoPackageJson).pipe(
          Effect.flatMap((project) => agents.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("not apply when the project has no managed script", () =>
      Effect.gen(function* () {
        const unmanagedPackageJson = { scripts: { check: "tsc --noEmit" } }
        const files = makeFiles({ "package.json": yield* stringifyJson(unmanagedPackageJson) })
        const result = yield* readProject(ROOT, unmanagedPackageJson).pipe(
          Effect.flatMap((project) => agents.assess(project)),
          provideFiles(files)
        )

        expect(result).toStrictEqual({ applicable: false })
      })
    )
  })
})

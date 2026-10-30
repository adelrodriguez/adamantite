import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import agents from "#lib/integrations/workspace/agents.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("agents", () => {
  describe("assess", () => {
    const packageJson = {
      scripts: { analyze: "adamantite analyze", check: "adamantite check" },
    }

    it.effect("report a missing AGENTS.md at the project root", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": JSON.stringify(packageJson) })
        const result = yield* agents.assess(ROOT, packageJson).pipe(provideFiles(files))

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
          "package.json": JSON.stringify(packageJson),
        })
        const result = yield* agents.assess(ROOT, packageJson).pipe(provideFiles(files))

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
          "package.json": JSON.stringify(monorepoPackageJson),
          "packages/web/package.json": JSON.stringify({ name: "web" }),
        })
        const result = yield* agents.assess(ROOT, monorepoPackageJson).pipe(provideFiles(files))

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("not apply when the project has no managed script", () =>
      Effect.gen(function* () {
        const unmanagedPackageJson = { scripts: { check: "tsc --noEmit" } }
        const files = makeFiles({ "package.json": JSON.stringify(unmanagedPackageJson) })
        const result = yield* agents.assess(ROOT, unmanagedPackageJson).pipe(provideFiles(files))

        expect(result).toStrictEqual({ applicable: false })
      })
    )
  })
})

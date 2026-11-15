import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { getOxlintCommand } from "#lib/integrations/tooling/oxlint/entry.ts"
import { OxlintCommand } from "#lib/integrations/tooling/oxlint/files.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { readProject } from "#lib/project/project.ts"

const REPO = join(import.meta.dirname, "../../../../../..")

function assess(root: string) {
  return Effect.runPromise(
    readProject(root).pipe(
      Effect.flatMap((project) => oxlint.assess(project)),
      Effect.provide([
        NodeServices.layer,
        ModuleResolver.layer,
        Layer.succeed(OxlintCommand)((project) => ({
          ...getOxlintCommand(project),
          args: [join(REPO, "src/oxlint.ts")],
        })),
      ])
    )
  )
}

describe("oxlint config load", () => {
  it("report the error of a workspace config that imports a preset the package does not export", async () => {
    expect.hasAssertions()
    const root = mkdtempSync(join(tmpdir(), "adamantite-config-load-"))

    try {
      mkdirSync(join(root, "node_modules"))
      symlinkSync(join(REPO, "node_modules/oxlint"), join(root, "node_modules/oxlint"), "dir")
      symlinkSync(REPO, join(root, "node_modules/adamantite"), "dir")
      mkdirSync(join(root, "packages/app"), { recursive: true })
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          devDependencies: { oxlint: oxlint.version },
          name: "probe",
          scripts: { check: "adamantite check" },
          type: "module",
        })
      )
      writeFileSync(join(root, "oxlint.config.ts"), "export default {}\n")
      // A lint run loads the config of each folder, so a package config fails the whole run.
      writeFileSync(
        join(root, "packages/app/oxlint.config.ts"),
        'import shadcn from "adamantite/lint/shadcn"\nexport default { extends: [shadcn] }\n'
      )
      writeFileSync(join(root, "packages/app/index.ts"), "export const value = 1\n")

      const assessment = await assess(root)

      expect(assessment.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining(
            "Package subpath './lint/shadcn' is not defined by \"exports\""
          ),
          id: "oxlint-config-load-failure",
        })
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

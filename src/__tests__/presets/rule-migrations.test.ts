import { mkdirSync, readdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { getOxlintCommand } from "#lib/integrations/tooling/oxlint/entry.ts"
import { OxlintCommand } from "#lib/integrations/tooling/oxlint/files.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"
import { readProject } from "#lib/workspace/project.ts"

const REPO = join(import.meta.dirname, "../../..")

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

describe("real rule migration assessment", () => {
  it("leave custom rule caches outside the project and read component suppressions", async () => {
    expect.hasAssertions()
    const root = mkdtempSync(join(tmpdir(), "adamantite-migration-"))

    try {
      mkdirSync(join(root, "node_modules"))
      symlinkSync(join(REPO, "node_modules/oxlint"), join(root, "node_modules/oxlint"), "dir")
      mkdirSync(join(root, ".adamantite/lint"), { recursive: true })
      writeFileSync(
        join(root, ".adamantite/lint/probe.ts"),
        "export default { create: () => ({}) }\n"
      )
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          devDependencies: { oxlint: oxlint.version },
          name: "probe",
          scripts: { check: "adamantite check" },
          type: "module",
        })
      )
      writeFileSync(
        join(root, "oxlint.config.ts"),
        `import custom from ${JSON.stringify(pathToFileURL(join(REPO, "presets/rules/index.ts")).href)}\nexport default { extends: [custom()] }\n`
      )
      writeFileSync(
        join(root, "App.vue"),
        '<script lang="tsx">\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration probe\nconst view = <div />\n</script>\n<template><div /></template>\n'
      )
      writeFileSync(
        join(root, "App.svelte"),
        '<script lang="ts">\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration probe\nconst value: number = 1\n</script>\n<div>{value}</div>\n'
      )
      writeFileSync(
        join(root, "App.astro"),
        "---\n// oxlint-disable-next-line anti-slop/no-reflect-get -- migration probe\nconst value: number = 1\n---\n<div>{value}</div>\n"
      )
      const files = readdirSync(root, { recursive: true })
      const before = await assess(root)
      const migration = before.findings?.find((finding) => finding.id === "antislop-rule-migration")

      expect(readdirSync(root, { recursive: true })).toStrictEqual(files)
      expect(before.warnings).toStrictEqual([])
      expect(migration?.currentState.split("\n")).toStrictEqual([
        expect.stringContaining("App.astro:2"),
        expect.stringContaining("App.svelte:2"),
        expect.stringContaining("App.vue:2"),
      ])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

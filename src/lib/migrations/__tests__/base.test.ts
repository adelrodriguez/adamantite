import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { defineMigration, runMigration } from "#lib/migrations/base.ts"
import { FileNotFound, MigrationValidationFailed } from "#lib/shared/errors.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>)
}

describe("runMigration", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-migration-base-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  test("restore tracked files when migrate fails", async () => {
    await Bun.write("existing.txt", "before\n")

    const migration = defineMigration({
      check: () => Effect.succeed({ applicable: false, warnings: [] }),
      files: ["existing.txt", "created.txt"],
      id: "failing-migration",
      migrate: () =>
        Effect.gen(function* () {
          yield* Effect.promise(() => Bun.write("existing.txt", "after\n"))
          yield* Effect.promise(() => Bun.write("created.txt", "created\n"))
          return yield* new FileNotFound({ path: "missing.txt" })
        }),
      tags: ["update"],
      title: "Failing migration",
    })

    try {
      await runTestEffect(runMigration(migration, { cwd: tempDir }))
      throw new Error("Expected migration to fail")
    } catch {
      expect(await Bun.file("existing.txt").text()).toBe("before\n")
      expect(await Bun.file("created.txt").exists()).toBe(false)
    }
  })

  test("restore tracked files when validate fails", async () => {
    await Bun.write("existing.txt", "before\n")

    const migration = defineMigration({
      check: () => Effect.succeed({ applicable: false, warnings: [] }),
      files: ["existing.txt"],
      id: "invalid-migration",
      migrate: () => Effect.promise(() => Bun.write("existing.txt", "after\n")),
      tags: ["update"],
      title: "Invalid migration",
      validate: () =>
        Effect.fail(
          new MigrationValidationFailed({
            migrationId: "invalid-migration",
            reason: "validation failed",
          })
        ),
    })

    try {
      await runTestEffect(runMigration(migration, { cwd: tempDir }))
      throw new Error("Expected validation to fail")
    } catch {
      expect(await Bun.file("existing.txt").text()).toBe("before\n")
    }
  })
})

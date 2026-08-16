import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import { defineMigration, runMigration } from "#lib/migrations/base.ts"
import { FileNotFound, MigrationValidationFailed } from "#lib/shared/errors.ts"

function runTestEffect<A, E, R>(effect: Effect.Effect<A, E, R>) {
  // SAFETY: runMigration declares DependencyInstaller and NodeVersionResolver for migrations that use them, but the stub migrations here never do, so NodeServices satisfies every service actually accessed.
  return effect.pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<A, E>
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

  it.effect("return the migrate result", () =>
    Effect.gen(function* () {
      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        id: "reporting-migration",
        migrate: () => Effect.succeed({ warnings: ["something to surface"] }),
        tags: ["update"],
        title: "Reporting migration",
      })

      const result = yield* runTestEffect(runMigration(migration, { cwd: tempDir }))

      expect(result).toEqual({ warnings: ["something to surface"] })
    })
  )

  it.effect("restore tracked files when migrate fails", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("existing.txt", "before\n"))

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt", "created.txt"],
        id: "failing-migration",
        migrate: () =>
          Effect.gen(function* () {
            yield* Effect.promise(() => writeFile("existing.txt", "after\n"))
            yield* Effect.promise(() => writeFile("created.txt", "created\n"))
            return yield* new FileNotFound({ path: "missing.txt" })
          }),
        tags: ["update"],
        title: "Failing migration",
      })

      const exit = yield* Effect.exit(runTestEffect(runMigration(migration, { cwd: tempDir })))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* Effect.promise(() => testFile("existing.txt").text())).toBe("before\n")
      expect(yield* Effect.promise(() => testFile("created.txt").exists())).toBe(false)
    })
  )

  it.effect("restore tracked files when validate fails", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("existing.txt", "before\n"))

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt"],
        id: "invalid-migration",
        migrate: () =>
          Effect.promise(() => writeFile("existing.txt", "after\n")).pipe(
            Effect.as({ warnings: [] })
          ),
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

      const exit = yield* Effect.exit(runTestEffect(runMigration(migration, { cwd: tempDir })))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* Effect.promise(() => testFile("existing.txt").text())).toBe("before\n")
    })
  )

  it.effect("restore tracked files when migrate defects", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => writeFile("existing.txt", "before\n"))

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt"],
        id: "defective-migration",
        migrate: () =>
          Effect.promise(() => writeFile("existing.txt", "after\n")).pipe(
            Effect.andThen(Effect.die("migration defect"))
          ),
        tags: ["update"],
        title: "Defective migration",
      })

      const exit = yield* Effect.exit(runTestEffect(runMigration(migration, { cwd: tempDir })))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* Effect.promise(() => testFile("existing.txt").text())).toBe("before\n")
    })
  )
})

import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { createDependencyInstallerTestContext } from "#commands/__tests__/command-test-helpers.ts"
import { defineMigration, runMigration } from "#lib/migrations/base.ts"
import { FileNotFound, MigrationValidationFailed } from "#lib/shared/errors.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideServices(files: FileSystemTestContext) {
  const base = Layer.mergeAll(files.layer, Path.layer)

  return Effect.provide(
    Layer.mergeAll(
      base,
      NodeVersionResolver.layer.pipe(Layer.provide(base)),
      createDependencyInstallerTestContext().layer
    )
  )
}

describe("runMigration", () => {
  it.effect("return the migrate result", () =>
    Effect.gen(function* () {
      const files = makeFiles()
      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        id: "reporting-migration",
        migrate: () => Effect.succeed({ warnings: ["something to surface"] }),
        tags: ["update"],
        title: "Reporting migration",
      })

      const result = yield* runMigration(migration, { cwd: ROOT }).pipe(provideServices(files))

      expect(result).toEqual({ warnings: ["something to surface"] })
    })
  )

  it.effect("restore tracked files when migrate fails", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "existing.txt": "before\n" })

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt", "created.txt"],
        id: "failing-migration",
        migrate: () =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              files.write("existing.txt", "after\n")
              files.write("created.txt", "created\n")
            })
            return yield* new FileNotFound({ path: "missing.txt" })
          }),
        tags: ["update"],
        title: "Failing migration",
      })

      const exit = yield* Effect.exit(
        runMigration(migration, { cwd: ROOT }).pipe(provideServices(files))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(files.read("existing.txt")).toBe("before\n")
      expect(files.exists("created.txt")).toBe(false)
    })
  )

  it.effect("restore tracked files when validate fails", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "existing.txt": "before\n" })

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt"],
        id: "invalid-migration",
        migrate: () =>
          Effect.sync(() => {
            files.write("existing.txt", "after\n")
          }).pipe(Effect.as({ warnings: [] })),
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

      const exit = yield* Effect.exit(
        runMigration(migration, { cwd: ROOT }).pipe(provideServices(files))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(files.read("existing.txt")).toBe("before\n")
    })
  )

  it.effect("restore tracked files when migrate defects", () =>
    Effect.gen(function* () {
      const files = makeFiles({ "existing.txt": "before\n" })

      const migration = defineMigration({
        check: () => Effect.succeed({ status: "not-applicable" as const, warnings: [] }),
        files: ["existing.txt"],
        id: "defective-migration",
        migrate: () =>
          Effect.sync(() => {
            files.write("existing.txt", "after\n")
          }).pipe(Effect.andThen(Effect.die("migration defect"))),
        tags: ["update"],
        title: "Defective migration",
      })

      const exit = yield* Effect.exit(
        runMigration(migration, { cwd: ROOT }).pipe(provideServices(files))
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(files.read("existing.txt")).toBe("before\n")
    })
  )
})

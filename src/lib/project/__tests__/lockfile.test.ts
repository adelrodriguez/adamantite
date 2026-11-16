import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  LOCKFILE_PATH,
  Lockfile,
  readLockfile,
  readSelection,
  renderLockfile,
} from "#lib/project/lockfile.ts"
import { stringifyJson } from "#lib/shared/json.ts"

function provideFiles(files: Record<string, string>) {
  const context = createFileSystemTestContext({ files })

  return Effect.provide(Layer.mergeAll(context.layer, Path.layer))
}

describe("lockfile", () => {
  it.effect.prop(
    "read back each lockfile that it renders",
    { lockfile: Lockfile },
    ({ lockfile }) =>
      Effect.gen(function* () {
        const content = yield* renderLockfile(lockfile)

        const read = yield* readLockfile("/project").pipe(
          provideFiles({ [LOCKFILE_PATH]: content })
        )

        // Generated objects have no prototype, so the test compares the rendered text.
        expect(yield* renderLockfile(Option.getOrThrow(read))).toBe(content)
      }),
    { arbitrary: { runs: 100 } }
  )

  it.effect.prop(
    "read no selection from JSON that is not a lockfile",
    { value: Schema.MutableJson },
    ({ value }) =>
      Effect.gen(function* () {
        const content = yield* stringifyJson(value)

        const selection = yield* readSelection("/project").pipe(
          provideFiles({ [LOCKFILE_PATH]: content })
        )

        expect(selection).toStrictEqual(Option.none())
      }),
    { arbitrary: { runs: 200 } }
  )
})

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { CommandRunner, type CommandRunOptions } from "#lib/execution/command-runner.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")
const STRICT_PRESET = join(REPO_ROOT, "presets/lint/strict.ts")
const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")

// The build writes the Oxlint entry beside the CLI, so a run from source starts its source. Oxfmt
// starts from this repository's install.
function toSource(options: CommandRunOptions): CommandRunOptions {
  if (options.name === "oxlint") {
    return { ...options, args: [join(REPO_ROOT, "src/oxlint.ts"), ...options.args.slice(1)] }
  }

  if (options.command === "oxfmt") {
    return { ...options, command: join(REPO_ROOT, "node_modules/.bin/oxfmt") }
  }

  return options
}

const SOURCE_RUNNER = Layer.effect(CommandRunner)(
  Effect.gen(function* () {
    const runner = yield* CommandRunner

    return CommandRunner.make((options) => runner.exitCode(toSource(options)))
  })
).pipe(Layer.provide(CommandRunner.layer), Layer.provide(NodeServices.layer))

// In each case, the spacing rule needs a blank line that appears only after another change: Oxfmt
// wraps a line, or another lint fix moves a statement.
const CASES = {
  "moved.ts": [
    "export function pick(a: number): number {",
    "  if (a) {",
    "    return 1",
    "  } else {",
    "    console.info(a)",
    "  }",
    "  return 0",
    "}",
    "",
  ].join("\n"),
  "wrapped.ts": [
    "declare function load(first: string, second: string, third: string, fourth: string): number",
    "",
    "export function run(): number {",
    "  const a = 1",
    '  const b = load("first argument value", "second argument value", "third argument value", "fourth value") + a',
    "  return b",
    "}",
    "",
  ].join("\n"),
}

describe("fix with the strict preset", () => {
  let project: string

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-fix-"))
    // The Oxlint entry resolves Oxlint from the project that it lints.
    symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"))
    writeFileSync(
      join(project, "oxlint.config.ts"),
      [
        `import core from ${JSON.stringify(CORE_PRESET)}`,
        `import strict from ${JSON.stringify(STRICT_PRESET)}`,
        "",
        "export default { extends: [core, strict] }",
        "",
      ].join("\n")
    )
    writeFileSync(
      join(project, "oxfmt.config.ts"),
      `import format from ${JSON.stringify(FORMAT_PRESET)}\n\nexport default format\n`
    )

    for (const [file, source] of Object.entries(CASES)) {
      writeFileSync(join(project, file), source)
    }
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  function fixThenCheck(file: keyof typeof CASES) {
    return Effect.gen(function* () {
      yield* Toolchain.fix({ cwd: project, files: [file] })

      const checked = yield* Effect.exit(Toolchain.check({ cwd: project, files: [file] }))

      expect(checked).toStrictEqual(Exit.void)
    }).pipe(Effect.provide(SOURCE_RUNNER))
  }

  it.live("leave a line that Oxfmt wraps in a state that check accepts", () =>
    fixThenCheck("wrapped.ts")
  )

  // Oxlint applies one pass of fixes, so the blank line after the statement that no-else-return
  // moves needs a second fix. Remove `.fails` when Oxlint repeats its fix passes:
  // https://github.com/oxc-project/oxc/issues/16118
  it.live.fails("leave a statement that another fix moves in a state that check accepts", () =>
    fixThenCheck("moved.ts")
  )
})

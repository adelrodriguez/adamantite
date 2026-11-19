import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Stream from "effect/Stream"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"
import { CliNotFound, TrialLintFailed } from "#lib/shared/errors.ts"

// Oxlint prints a line, such as "No files found to lint.", before its JSON report.
const JSON_REPORT_START = /^\{/mu

// Oxlint prints the folder separators of the platform, and the trial and the overrides compare a
// report path with the project paths that git prints.
const ReportPath = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (path) => path.replaceAll("\\", "/"),
      encode: (path) => path,
    })
  )
)

const OxlintReport = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      // A parse error has no rule, so it has no code.
      code: Schema.optional(Schema.String),
      filename: ReportPath,
      labels: Schema.Array(
        Schema.Struct({ span: Schema.Struct({ column: Schema.Int, line: Schema.Int }) })
      ),
      message: Schema.String,
    })
  ),
  number_of_files: Schema.Int,
})

const decodeOxlintReport = Schema.decodeUnknownOption(Schema.fromJsonString(OxlintReport))

export function parseOxlintReport(stdout: string) {
  const start = stdout.search(JSON_REPORT_START)

  return start === -1 ? Option.none() : decodeOxlintReport(stdout.slice(start))
}

export const OxlintCommand = Context.Reference<typeof getOxlintCommand>(
  "adamantite/OxlintCommand",
  { defaultValue: () => getOxlintCommand }
)

export const runOxlint = Effect.fn("runOxlint")(
  function* (cwd: string, args: readonly string[], project: string = cwd) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = yield* (yield* OxlintCommand)(project)

    // Oxlint loads TypeScript configs through Node.js, which warns about each typeless `package.json`
    // that it reparses as ESM, and the user cannot act on the warning. Any string decodes, and the
    // default covers a missing variable, so only a provider that cannot read its source fails, which
    // is a defect.
    const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
      Config.withDefault(""),
      Config.map((options) =>
        [options, "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"].filter(Boolean).join(" ")
      ),
      Effect.orDie
    )

    const handle = yield* spawner.spawn(
      ChildProcess.make(command.command, [...command.args, ...args], {
        cwd,
        env: { ...command.env, NODE_OPTIONS: nodeOptions },
        extendEnv: true,
        stdin: "ignore",
      })
    )

    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: "unbounded" }
    )

    // Oxlint prints a config error to stdout or to stderr.
    return { exitCode, output: `${stdout}${stderr}`.trim(), stdout }
  },
  Effect.scoped,
  Effect.catchReason(
    "PlatformError",
    "NotFound",
    () => Effect.fail(new CliNotFound({ command: "node" })),
    (_reason, error) => Effect.fail(new TrialLintFailed({ output: error.message }))
  )
)

export const listLintedFiles = Effect.fn("listLintedFiles")(function* (
  cwd: string,
  files: readonly string[] = []
) {
  // Oxlint leaves out of `--debug=files` the files that an ignore pattern or `.gitignore` matches.
  const { exitCode, output, stdout } = yield* runOxlint(cwd, ["--debug=files", ...files])

  if (exitCode !== 0) {
    return yield* new TrialLintFailed({ output })
  }

  return stdout
    .split("\n")
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter((line) => line.length > 0)
})

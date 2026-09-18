import { resolve } from "node:path"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { InvalidToolOutput } from "#lib/shared/errors.ts"

export interface OxlintDiagnostic {
  readonly column: number
  readonly file: string
  readonly help?: string
  readonly line: number
  readonly message: string
  readonly raw: Schema.JsonObject
  readonly rule: string
  readonly url?: string
}

const OxlintDiagnosticFields = Schema.Struct({
  // Parse errors and unused-directive reports have no rule code.
  code: Schema.optionalKey(Schema.String),
  filename: Schema.String,
  help: Schema.optionalKey(Schema.String),
  labels: Schema.NonEmptyArray(
    Schema.Struct({
      span: Schema.Struct({
        column: Schema.Number,
        line: Schema.Number,
      }),
    })
  ),
  message: Schema.String,
  url: Schema.optionalKey(Schema.String),
})

const OxlintOutput = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.JsonObject),
  })
)

// Each diagnostic is decoded twice so that `raw` keeps the fields the schema does not name.
export const parseOxlintDiagnostics = (output: string, cwd: string) =>
  Schema.decodeUnknownEffect(OxlintOutput)(output).pipe(
    Effect.flatMap((parsed) =>
      Effect.forEach(
        parsed.diagnostics,
        (raw) =>
          Schema.decodeUnknownEffect(OxlintDiagnosticFields)(raw).pipe(
            Effect.map((diagnostic): OxlintDiagnostic => {
              const span = diagnostic.labels[0].span

              return {
                column: span.column,
                file: resolve(cwd, diagnostic.filename),
                help: diagnostic.help,
                line: span.line,
                message: diagnostic.message,
                raw,
                rule: diagnostic.code ?? "oxc(parse-error)",
                url: diagnostic.url,
              }
            })
          ),
        { concurrency: 1 }
      )
    ),
    Effect.mapError((cause) => new InvalidToolOutput({ cause, command: oxlint.name }))
  )

export const collectOxlintDiagnostics = Effect.fn("collectOxlintDiagnostics")(function* ({
  cwd,
  forwardedArguments,
  targets,
  typeAware = false,
}: {
  readonly cwd: string
  readonly forwardedArguments: readonly string[]
  readonly targets: readonly string[]
  readonly typeAware?: boolean
}) {
  const runner = yield* CommandRunner
  const result = yield* runner.capture({
    args: [
      ...(typeAware ? ["--type-aware"] : []),
      ...forwardedArguments,
      ...targets,
      "--format",
      "json",
    ],
    command: oxlint.name,
    cwd,
  })

  return yield* parseOxlintDiagnostics(result.stdout, cwd)
})

export const verifyOxlintFile = Effect.fn("verifyOxlintFile")(function* ({
  cwd,
  file,
  fixArguments,
  forwardedArguments,
  typeAware,
}: {
  readonly cwd: string
  readonly file: string
  readonly fixArguments: readonly string[]
  readonly forwardedArguments: readonly string[]
  readonly typeAware: boolean
}) {
  const runner = yield* CommandRunner
  yield* runner.exitCode({
    args: [...fixArguments, ...forwardedArguments, file],
    command: oxlint.name,
    cwd,
    stderr: "ignore",
    stdout: "ignore",
  })
  // Oxfmt fails on a file it cannot parse. Oxlint then reports the parse error as a diagnostic.
  yield* runner.exitCode({
    args: ["--write", file],
    command: oxfmt.name,
    cwd,
    stderr: "ignore",
    stdout: "ignore",
  })

  return yield* collectOxlintDiagnostics({
    cwd,
    forwardedArguments,
    targets: [file],
    typeAware,
  })
})

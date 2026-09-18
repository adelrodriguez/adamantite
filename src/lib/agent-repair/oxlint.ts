import { isAbsolute, resolve } from "node:path"
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

const OxlintOutput = Schema.Struct({
  diagnostics: Schema.Array(Schema.JsonObject),
})

const OxlintDiagnosticFields = Schema.Struct({
  code: Schema.String,
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

export function parseOxlintDiagnostics(output: string, cwd: string): OxlintDiagnostic[] {
  try {
    const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintOutput))(output)
    return parsed.diagnostics.map((raw) => {
      const diagnostic = Schema.decodeUnknownSync(OxlintDiagnosticFields)(raw)
      const span = diagnostic.labels[0].span

      return {
        column: span.column,
        file: isAbsolute(diagnostic.filename)
          ? diagnostic.filename
          : resolve(cwd, diagnostic.filename),
        help: diagnostic.help,
        line: span.line,
        message: diagnostic.message,
        raw,
        rule: diagnostic.code,
        url: diagnostic.url,
      }
    })
  } catch (error) {
    throw new InvalidToolOutput({ cause: error, command: oxlint.name })
  }
}

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

  if (result.status === "timed-out") {
    return yield* new InvalidToolOutput({ command: oxlint.name })
  }

  return yield* Effect.try({
    catch: (cause) =>
      cause instanceof InvalidToolOutput
        ? cause
        : new InvalidToolOutput({ cause, command: oxlint.name }),
    try: () => parseOxlintDiagnostics(result.stdout, cwd),
  })
})

export const verifyOxlintFile = Effect.fn("verifyOxlintFile")(function* ({
  cwd,
  file,
  fixArguments,
  forwardedArguments,
}: {
  readonly cwd: string
  readonly file: string
  readonly fixArguments: readonly string[]
  readonly forwardedArguments: readonly string[]
}) {
  const runner = yield* CommandRunner
  yield* runner.exitCode({
    args: [...fixArguments, ...forwardedArguments, file],
    command: oxlint.name,
    cwd,
    stderr: "ignore",
    stdout: "ignore",
  })
  yield* runner.run({ args: ["--write", file], command: oxfmt.name, cwd })

  return yield* collectOxlintDiagnostics({
    cwd,
    forwardedArguments,
    targets: [file],
  })
})

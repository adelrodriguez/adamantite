import { resolve } from "node:path"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import { InvalidToolOutput } from "#lib/shared/errors.ts"

export type AnalyzeDiagnostic = KnipDiagnostic | SherifDiagnostic

export interface KnipDiagnostic {
  readonly column?: number
  readonly file: string
  readonly line?: number
  readonly message: string
  readonly raw: Schema.Json
  readonly stage: "unused"
  readonly type: string
}

export interface SherifDiagnostic {
  readonly file: string
  readonly message: string
  readonly raw: string
  readonly stage: "monorepo"
  readonly type: "sherif"
}

function isJsonObject(value: Schema.Json | undefined): value is Schema.JsonObject {
  return value !== undefined && Schema.is(Schema.JsonObject)(value)
}

function isJsonArray(value: Schema.Json | undefined): value is readonly Schema.Json[] {
  return value !== undefined && Schema.is(Schema.Array(Schema.Json))(value)
}

const KNIP_ISSUE_TYPES = [
  "binaries",
  "catalog",
  "catalogReferences",
  "dependencies",
  "duplicates",
  "enumMembers",
  "exports",
  "files",
  "namespaceMembers",
  "nsExports",
  "nsTypes",
  "types",
  "unlisted",
  "unresolved",
] as const

function optionalNumber(value: Schema.Json | undefined): number | undefined {
  return Predicate.isNumber(value) ? value : undefined
}

function issueMessage(value: Schema.Json): string {
  if (isJsonObject(value) && Predicate.isString(value["name"])) {
    return value["name"]
  }
  if (Predicate.isString(value)) {
    return value
  }
  return JSON.stringify(value)
}

export function parseKnipDiagnostics(output: string, cwd: string): KnipDiagnostic[] {
  let parsed: Schema.Json
  try {
    parsed = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(output)
  } catch (error) {
    throw new InvalidToolOutput({ cause: error, command: knip.name })
  }

  if (!isJsonObject(parsed) || !isJsonArray(parsed["issues"])) {
    throw new InvalidToolOutput({ command: knip.name })
  }

  const diagnostics: KnipDiagnostic[] = []
  for (const group of parsed["issues"]) {
    if (!isJsonObject(group) || !Predicate.isString(group["file"])) {
      throw new InvalidToolOutput({ command: knip.name })
    }
    const file = resolve(cwd, group["file"])
    for (const type of KNIP_ISSUE_TYPES) {
      const values = group[type]
      if (!isJsonArray(values)) {
        continue
      }
      for (const value of values) {
        diagnostics.push({
          column: isJsonObject(value) ? optionalNumber(value["col"]) : undefined,
          file,
          line: isJsonObject(value) ? optionalNumber(value["line"]) : undefined,
          message: issueMessage(value),
          raw: value,
          stage: "unused",
          type,
        })
      }
    }
  }
  return diagnostics
}

export const collectKnipDiagnostics = Effect.fn("collectKnipDiagnostics")(function* ({
  cwd,
  forwardedArguments,
  strict,
}: {
  readonly cwd: string
  readonly forwardedArguments: readonly string[]
  readonly strict: boolean
}) {
  const runner = yield* CommandRunner
  const result = yield* runner.capture({
    args: [
      ...(strict ? ["--production", "--strict"] : []),
      ...forwardedArguments,
      "--reporter",
      "json",
    ],
    command: knip.name,
    cwd,
  })
  if (result.status === "timed-out") {
    return yield* new InvalidToolOutput({ command: knip.name })
  }
  return yield* Effect.try({
    catch: (cause) =>
      cause instanceof InvalidToolOutput
        ? cause
        : new InvalidToolOutput({ cause, command: knip.name }),
    try: () => parseKnipDiagnostics(result.stdout, cwd),
  })
})

export const applyKnipFixes = Effect.fn("applyKnipFixes")(function* ({
  cwd,
  forwardedArguments,
  strict,
}: {
  readonly cwd: string
  readonly forwardedArguments: readonly string[]
  readonly strict: boolean
}) {
  const runner = yield* CommandRunner
  yield* runner.exitCode({
    args: [
      "--fix",
      "--allow-remove-files",
      ...(strict ? ["--production", "--strict"] : []),
      ...forwardedArguments,
    ],
    command: knip.name,
    cwd,
    stderr: "ignore",
    stdout: "ignore",
  })
})

export const collectSherifDiagnostics = Effect.fn("collectSherifDiagnostics")(function* ({
  cwd,
  forwardedArguments,
}: {
  readonly cwd: string
  readonly forwardedArguments: readonly string[]
}) {
  const runner = yield* CommandRunner
  const result = yield* runner.capture({
    args: [...forwardedArguments],
    command: sherif.name,
    cwd,
  })

  if (result.status === "exited" && result.exitCode === 0) {
    return []
  }

  const output = `${result.stdout}\n${result.stderr}`.trim()
  return [
    {
      file: cwd,
      message: output || "Sherif reported monorepo consistency issues.",
      raw: output,
      stage: "monorepo",
      type: "sherif",
    },
  ] satisfies SherifDiagnostic[]
})

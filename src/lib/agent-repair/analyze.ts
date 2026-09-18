import { resolve } from "node:path"
import * as Effect from "effect/Effect"
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

const KnipIssue = Schema.Struct({
  col: Schema.optionalKey(Schema.Number),
  kind: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Number),
  name: Schema.String,
  namespace: Schema.optionalKey(Schema.String),
  pos: Schema.optionalKey(Schema.Number),
  specifier: Schema.optionalKey(Schema.String),
})

const KnipIssues = Schema.Array(KnipIssue)
const NestedKnipIssues = Schema.Array(KnipIssues)

const KnipOutput = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      binaries: Schema.optionalKey(KnipIssues),
      catalog: Schema.optionalKey(KnipIssues),
      catalogReferences: Schema.optionalKey(KnipIssues),
      cycles: Schema.optionalKey(NestedKnipIssues),
      dependencies: Schema.optionalKey(KnipIssues),
      devDependencies: Schema.optionalKey(KnipIssues),
      duplicates: Schema.optionalKey(NestedKnipIssues),
      enumMembers: Schema.optionalKey(KnipIssues),
      exports: Schema.optionalKey(KnipIssues),
      file: Schema.String,
      files: Schema.optionalKey(KnipIssues),
      namespaceMembers: Schema.optionalKey(KnipIssues),
      nsExports: Schema.optionalKey(KnipIssues),
      nsTypes: Schema.optionalKey(KnipIssues),
      optionalPeerDependencies: Schema.optionalKey(KnipIssues),
      owners: Schema.optionalKey(KnipIssues),
      types: Schema.optionalKey(KnipIssues),
      unlisted: Schema.optionalKey(KnipIssues),
      unresolved: Schema.optionalKey(KnipIssues),
    })
  ),
})

const KNIP_ISSUE_TYPES = [
  "binaries",
  "catalog",
  "catalogReferences",
  "cycles",
  "dependencies",
  "devDependencies",
  "duplicates",
  "enumMembers",
  "exports",
  "files",
  "namespaceMembers",
  "nsExports",
  "nsTypes",
  "optionalPeerDependencies",
  "types",
  "unlisted",
  "unresolved",
] as const

export function parseKnipDiagnostics(output: string, cwd: string): KnipDiagnostic[] {
  try {
    const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(KnipOutput))(output)
    const diagnostics: KnipDiagnostic[] = []

    for (const group of parsed.issues) {
      const file = resolve(cwd, group.file)
      for (const type of KNIP_ISSUE_TYPES) {
        const values = group[type]?.flat() ?? []
        for (const value of values) {
          diagnostics.push({
            column: value.col,
            file,
            line: value.line,
            message: value.name,
            raw: value,
            stage: "unused",
            type,
          })
        }
      }
    }

    return diagnostics
  } catch (error) {
    throw new InvalidToolOutput({ cause: error, command: knip.name })
  }
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

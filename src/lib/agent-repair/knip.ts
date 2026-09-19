import { resolve } from "node:path"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { InvalidToolOutput } from "#lib/shared/errors.ts"

export interface KnipDiagnostic {
  readonly column?: number
  readonly file: string
  readonly line?: number
  readonly message: string
  readonly raw: Schema.Json
  readonly type: string
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

const FlatGroup = Schema.optionalKey(KnipIssues)
// Knip nests `cycles` and `duplicates` one level deeper than the other issue types.
const NestedGroup = Schema.optionalKey(Schema.Array(KnipIssues))

const KNIP_ISSUE_GROUPS = {
  binaries: FlatGroup,
  catalog: FlatGroup,
  catalogReferences: FlatGroup,
  cycles: NestedGroup,
  dependencies: FlatGroup,
  devDependencies: FlatGroup,
  duplicates: NestedGroup,
  enumMembers: FlatGroup,
  exports: FlatGroup,
  files: FlatGroup,
  namespaceMembers: FlatGroup,
  nsExports: FlatGroup,
  nsTypes: FlatGroup,
  optionalPeerDependencies: FlatGroup,
  types: FlatGroup,
  unlisted: FlatGroup,
  unresolved: FlatGroup,
}

const KnipOutput = Schema.fromJsonString(
  Schema.Struct({
    issues: Schema.Array(
      Schema.Struct({
        ...KNIP_ISSUE_GROUPS,
        file: Schema.String,
      })
    ),
  })
)

export const parseKnipDiagnostics = (output: string, cwd: string) =>
  Schema.decodeUnknownEffect(KnipOutput)(output).pipe(
    Effect.map((parsed) =>
      parsed.issues.flatMap((group) =>
        Struct.keys(KNIP_ISSUE_GROUPS).flatMap((type) =>
          (group[type] ?? []).flat().map((issue): KnipDiagnostic => ({
            column: issue.col,
            file: resolve(cwd, group.file),
            line: issue.line,
            message: issue.name,
            raw: issue,
            type,
          }))
        )
      )
    ),
    Effect.mapError((cause) => new InvalidToolOutput({ cause, command: knip.name }))
  )

export const collectKnipDiagnostics = Effect.fn("collectKnipDiagnostics")(function* ({
  args,
  cwd,
}: {
  readonly args: readonly string[]
  readonly cwd: string
}) {
  const runner = yield* CommandRunner
  const result = yield* runner.capture({
    args: [...args, "--reporter", "json"],
    command: knip.name,
    cwd,
  })

  return yield* parseKnipDiagnostics(result.stdout, cwd)
})

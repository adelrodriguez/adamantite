import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { parseOxlintReport, runOxlint } from "#lib/integrations/oxlint/files.ts"
import { OxlintProbeFailed } from "#lib/shared/errors.ts"
import { writeFile } from "#lib/shared/filesystem.ts"
import { stringifyJson } from "#lib/shared/json.ts"

export const PROBE_FILE = "probe.js"

export const OxlintProbe = Context.Reference<URL>("adamantite/OxlintProbe", {
  defaultValue: () => new URL(PROBE_FILE, import.meta.url),
})

// Oxlint moves a report to its place in the file, so its line is the first or the last line of the
// source in the file.
const PLACE_FIELDS = { anchor: Schema.Literals(["end", "start"]), lines: Schema.Int }

const CommentsFact = Schema.Struct({
  ...PLACE_FIELDS,
  comments: Schema.Array(
    Schema.Struct({
      leading: Schema.Boolean,
      line: Schema.Int,
      type: Schema.Literals(["Block", "Line"]),
      value: Schema.String,
    })
  ),
})

const AstFact = Schema.Struct({ ...PLACE_FIELDS, program: Schema.Unknown })

const decodeCommentsFact = Schema.decodeUnknownOption(Schema.fromJsonString(CommentsFact))

const decodeAstFact = Schema.decodeUnknownOption(Schema.fromJsonString(AstFact))

interface ProbeReport {
  readonly line: number
  readonly message: string
}

const runProbe = Effect.fn("runProbe")(function* (
  cwd: string,
  rule: "ast" | "comments",
  files: readonly string[]
) {
  if (files.length === 0) {
    return new Map<string, { errors: string[]; reports: ProbeReport[] }>()
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  // `import.meta.url` is a `file:` URL in the bundle and in a run from source, so a failure is a
  // defect.
  const probe = yield* path.fromFileUrl(yield* OxlintProbe).pipe(Effect.orDie)
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "adamantite-probe-" })
  const config = path.join(folder, ".oxlintrc.json")
  const code = `adamantite-probe(${rule})`

  yield* writeFile(
    config,
    yield* stringifyJson({
      categories: { correctness: "off" },
      jsPlugins: [probe],
      plugins: [],
      rules: { [`adamantite-probe/${rule}`]: "error" },
    })
  )

  const { output, stdout } = yield* runOxlint(cwd, [
    "-c",
    config,
    "--disable-nested-config",
    "-f",
    "json",
    ...files,
  ]).pipe(
    Effect.catchTag("TrialLintFailed", (error) =>
      Effect.fail(new OxlintProbeFailed({ output: error.output }))
    )
  )

  const report = parseOxlintReport(stdout)

  if (Option.isNone(report)) {
    return yield* new OxlintProbeFailed({ output })
  }

  return new Map(
    files.map((file) => {
      const diagnostics = report.value.diagnostics.filter(
        (diagnostic) => diagnostic.filename === file
      )

      return [
        file,
        {
          // A parse error has no rule, so it has no code.
          errors: diagnostics.flatMap((diagnostic) =>
            diagnostic.code === undefined ? [diagnostic.message] : []
          ),
          reports: diagnostics.flatMap((diagnostic) =>
            diagnostic.code === code
              ? Array.head(diagnostic.labels).pipe(
                  Option.map(({ span }) => ({ line: span.line, message: diagnostic.message })),
                  Option.toArray
                )
              : []
          ),
        },
      ] as const
    })
  )
}, Effect.scoped)

// Oxlint parses each file as it lints it, so a Vue, Svelte, or Astro file gives the comments of
// its scripts, and a file that does not parse has none.
export const probeComments = Effect.fn("probeComments")(function* (
  cwd: string,
  files: readonly string[]
) {
  const probed = yield* runProbe(cwd, "comments", files)

  return [...probed].map(([file, { reports }]) => ({
    comments: Array.dedupeWith(
      reports.flatMap((report) =>
        decodeCommentsFact(report.message).pipe(
          Option.map((fact) => {
            const sourceStart = fact.anchor === "start" ? report.line : report.line - fact.lines + 1

            return fact.comments.map(({ line, ...comment }) => ({
              ...comment,
              line: sourceStart + line - 1,
            }))
          }),
          Option.getOrElse(() => [])
        )
      ),
      (first, second) => first.line === second.line && first.value === second.value
    ),
    file,
  }))
})

// A Vue, Svelte, or Astro file gives the tree of its first script.
export const probeAst = Effect.fn("probeAst")(function* (cwd: string, file: string) {
  const probed = yield* runProbe(cwd, "ast", [file])
  const { errors = [], reports = [] } = probed.get(file) ?? {}

  const program = Array.findFirst(reports, (report) =>
    decodeAstFact(report.message).pipe(Option.map(({ program: tree }) => tree))
  )

  return { errors, program }
})

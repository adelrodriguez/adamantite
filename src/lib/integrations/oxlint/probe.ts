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

/**
 * The file name of the probe plugin, `src/oxlint/probe.ts`, which the build writes beside the CLI
 * bundle, as `dist/probe.js`. `scripts/test-build.ts` checks that the build writes it.
 */
export const PROBE_FILE = "probe.js"

/**
 * The file URL of the probe plugin. A run from source, as in the tests, names
 * `src/oxlint/probe.ts`.
 */
export const OxlintProbe = Context.Reference<URL>("adamantite/OxlintProbe", {
  defaultValue: () => new URL(PROBE_FILE, import.meta.url),
})

/**
 * Where a report of the probe stands in its source, and the number of lines of the source. Oxlint
 * moves the report to its place in the file, so its line is the first or the last line of the
 * source in the file.
 */
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

/**
 * A report of a probe rule, with the line of the file where Oxlint put it.
 */
interface ProbeReport {
  readonly line: number
  readonly message: string
}

/**
 * Runs the `rule` of the probe plugin on `files`, relative to `cwd`, with the Oxlint runtime of
 * `cwd`. Each file gets the reports of the rule and the parse errors. The probe config turns off
 * every other rule, so the project config and its rules do not apply. Without files, Oxlint does
 * not run.
 */
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
  // The module URL of the bundle and of a source run is a `file:` URL, so a failure is a defect.
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

/**
 * The comments that can turn lint rules or type checks off in each of `files`, relative to `cwd`,
 * with their lines in the file, their text, their kind, and whether they lead their source. Oxlint
 * parses each file as it lints it, so a Vue, Svelte, or Astro file gives the comments of its
 * scripts, and a file that does not parse has none. Each comment comes once.
 */
export const probeComments = Effect.fn("probeComments")(function* (
  cwd: string,
  files: readonly string[]
) {
  const probed = yield* runProbe(cwd, "comments", files)

  return [...probed].map(([file, { reports }]) => ({
    comments: Array.dedupeWith(
      reports.flatMap((report) =>
        decodeCommentsFact(report.message).pipe(
          Option.map((fact) =>
            fact.comments.map(({ line, ...comment }) => ({
              ...comment,
              // The line of the file where the source of the report starts, from 1.
              line:
                (fact.anchor === "start" ? report.line : report.line - fact.lines + 1) + line - 1,
            }))
          ),
          Option.getOrElse(() => [])
        )
      ),
      (first, second) => first.line === second.line && first.value === second.value
    ),
    file,
  }))
})

/**
 * The syntax tree that Oxlint gives rules for `file`, relative to `cwd`, without the link of each
 * node to its parent, or the parse errors of the file. A Vue, Svelte, or Astro file gives the tree
 * of its first script.
 */
export const probeAst = Effect.fn("probeAst")(function* (cwd: string, file: string) {
  const probed = yield* runProbe(cwd, "ast", [file])
  const { errors = [], reports = [] } = probed.get(file) ?? {}

  const program = Array.findFirst(reports, (report) =>
    decodeAstFact(report.message).pipe(Option.map(({ program: tree }) => tree))
  )

  return { errors, program }
})

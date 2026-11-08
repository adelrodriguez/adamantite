import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import type { BrokenLink } from "#lib/hardening/agent-reach.ts"
import type { Finding } from "#lib/integrations/base.ts"
import { assessProject } from "#lib/assessment/index.ts"
import {
  DEFAULT_FIX_HISTORY_COMMITS,
  readHardenContext,
  readHardenReach,
  renderHardenPrompt,
} from "#lib/hardening/index.ts"
import { readOverrides } from "#lib/hardening/overrides.ts"
import { readSuppressions } from "#lib/hardening/suppressions.ts"
import {
  AdamantiteNotInNodeModules,
  AdamantiteNotInstalled,
  AdamantiteVersionMismatch,
  CommandFailed,
  ScopeOutsideProject,
} from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Toolchain from "#lib/toolchain/index.ts"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"
import { readWorkspace } from "#lib/workspace/monorepo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { readProject } from "#lib/workspace/project.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { AgentSessionEnded, chooseResolution } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

/**
 * A reason why the project fails the verification after a harden session.
 */
type VerificationFailure =
  | { readonly _tag: "BrokenLink"; readonly link: BrokenLink }
  | { readonly _tag: "CheckFailed" }
  | { readonly _tag: "Findings"; readonly findings: readonly Finding[] }

const {
  $match: matchFailure,
  BrokenLink: brokenLink,
  CheckFailed: checkFailed,
  Findings: doctorFindings,
} = Data.taggedEnum<VerificationFailure>()

function getLinkKey(link: BrokenLink) {
  return `${link.file}\0${link.target}`
}

/**
 * The version of the Adamantite that the project at `cwd` loads, or none when it is not installed.
 * It resolves `adamantite/lint` as Oxlint loads the preset, so an install in a parent
 * `node_modules` counts.
 */
const readInstalledVersion = Effect.fn("readInstalledVersion")(function* (cwd: string) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver
  const entry = yield* resolver.resolve(path.join(cwd, "package.json"), "adamantite/lint")

  if (Option.isNone(entry)) {
    return Option.none<string>()
  }

  for (
    let directory = path.dirname(entry.value);
    directory !== path.dirname(directory);
    directory = path.dirname(directory)
  ) {
    const manifest = yield* readPackageJson(directory).pipe(Effect.option)

    if (Option.isSome(manifest) && manifest.value.name === "adamantite") {
      return Option.fromUndefinedOr(manifest.value.version)
    }
  }

  return Option.none<string>()
})

const scope = Flag.Directory("path", { mustExist: true }).pipe(
  Flag.optional,
  Flag.withDescription(
    "Limit the session to a project folder or workspace package. The path is relative to the current directory"
  )
)

const commits = Flag.Int("commits").pipe(
  Flag.withSchema(
    Schema.Int.pipe(
      Schema.check(Schema.isGreaterThan(0, { message: "`--commits` must be a positive number" }))
    )
  ),
  Flag.withDefault(DEFAULT_FIX_HISTORY_COMMITS),
  Flag.withDescription("Set how many recent commits the agent reads to find past fixes")
)

export default Command.make("harden", { commits, scope }).pipe(
  Command.withDescription(
    "Ask a coding agent to turn project standards into custom rules and instructions"
  ),
  Command.withHandler(({ commits, scope }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const path = yield* Path.Path
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite harden")
      }

      const packageJson = yield* readPackageJson(cwd)

      // The Adamantite repository runs its own build, so it does not depend on itself.
      const isAdamantiteRepository = packageJson.name === "adamantite"

      if (
        !isAdamantiteRepository
        && !packageJson.devDependencies?.adamantite
        && !packageJson.dependencies?.adamantite
      ) {
        return yield* new AdamantiteNotInstalled({ command: "harden" })
      }

      // The prompt offers the presets and rules of this version, so the project must install it.
      const installedVersion = isAdamantiteRepository
        ? Option.fromUndefinedOr(packageJson.version)
        : yield* readInstalledVersion(cwd)

      if (Option.isNone(installedVersion)) {
        return yield* new AdamantiteNotInNodeModules({ command: "harden" })
      }

      if (installedVersion.value !== version) {
        return yield* new AdamantiteVersionMismatch({
          command: "harden",
          installed: installedVersion.value,
          running: version,
        })
      }

      const scopeDirectory = Option.isSome(scope) ? path.resolve(cwd, scope.value) : undefined

      if (scopeDirectory !== undefined) {
        const fromRoot = path.relative(cwd, scopeDirectory)

        if (
          fromRoot === ".."
          || fromRoot.startsWith(`..${path.sep}`)
          || path.isAbsolute(fromRoot)
        ) {
          return yield* new ScopeOutsideProject({ cwd, scope: scopeDirectory })
        }
      }

      // Each step before the session takes this read of the workspace.
      const workspace = yield* readWorkspace(cwd)
      const context = yield* readHardenContext(cwd, workspace, scopeDirectory)

      // These reads change no file in the project, so they run together.
      const [overrides, suppressions] = yield* Effect.all(
        [
          readOverrides(cwd, workspace, context.configs, context.scope),
          readSuppressions(cwd, context.scope),
        ],
        { concurrency: "unbounded" }
      )

      const prompt = renderHardenPrompt(context, {
        adamantiteVersion: version,
        commits,
        overrides,
        suppressions,
      })

      if (!isInteractive) {
        yield* prompter.message(prompt)

        return
      }

      const resolution = yield* chooseResolution({
        command: "Harden",
        cwd,
        message: "How do you want to harden this project?",
        prompt,
        subject: "the prompt",
      })

      if (!(resolution instanceof AgentSessionEnded)) {
        yield* prompter.outro("Harden ended without an agent session.")

        return
      }

      const { agent } = resolution

      // The agent verifies custom rules during the session with temporary cases. The resulting
      // project must still pass check and Doctor after the session ends.
      const checkFailures = yield* Toolchain.check({ cwd }).pipe(
        Effect.as([]),
        Effect.catchTags({
          CliNotFound: (error) =>
            prompter.log.error(error.message).pipe(Effect.as([checkFailed()])),
          CommandFailed: () => Effect.succeed([checkFailed()]),
        })
      )

      // The session can change the project, so agent reach and assessment share a fresh read.
      const project = yield* readProject(cwd)

      const [reachAfter, assessment] = yield* Effect.all(
        [readHardenReach(cwd, project.workspace, scopeDirectory), assessProject(project)],
        { concurrency: "unbounded" }
      )

      // A link that was broken before the session is a gap that the user may not have approved, so
      // only a link that the session added fails the verification.
      const brokenBefore = new Set(
        Option.match(context.agentReach, {
          onNone: () => [],
          onSome: (reach) => reach.brokenLinks.map((link) => getLinkKey(link)),
        })
      )

      const addedBrokenLinks = Option.match(reachAfter, {
        onNone: () => [],
        onSome: (reach) => reach.brokenLinks.filter((link) => !brokenBefore.has(getLinkKey(link))),
      })

      const failures = [
        ...checkFailures,
        ...(assessment.findings.length > 0
          ? [doctorFindings({ findings: assessment.findings })]
          : []),
        ...addedBrokenLinks.map((link) => brokenLink({ link })),
      ]

      for (const warning of assessment.warnings) {
        yield* prompter.log.warning(warning)
      }

      yield* Effect.forEach(
        failures,
        matchFailure({
          BrokenLink: ({ link }) =>
            prompter.log.error(
              `\`${link.file}\` links to \`${link.target}\`, which does not exist, after the ${agent.name} session.`
            ),
          CheckFailed: () =>
            prompter.log.error(`\`adamantite check\` failed after the ${agent.name} session.`),
          Findings: ({ findings }) =>
            prompter.log
              .warning(`Doctor found issues after the ${agent.name} session.`)
              .pipe(Effect.andThen(printFindings(findings))),
        }),
        { discard: true }
      )

      if (failures.length > 0) {
        yield* prompter.outro("⚠️ Harden verification failed.")

        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      yield* prompter.log.success(
        `\`adamantite check\` and Doctor pass after the ${agent.name} session.`
      )
      yield* prompter.outro("✅ Harden checks passed.")
    }).pipe(
      Effect.catchTag(
        [
          "AdamantiteNotInstalled",
          "AdamantiteNotInNodeModules",
          "AdamantiteVersionMismatch",
          "ScopeOutsideProject",
        ],
        (error) =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            const terminal = yield* TerminalCapabilities

            if (yield* terminal.isInteractive) {
              yield* prompter.log.warning(error.message)
              yield* prompter.outro("⚠️ Harden did not start.")
            } else {
              yield* prompter.message(error.message)
            }

            return yield* new CommandFailed({
              command: "harden",
              exitCode: ChildProcessSpawner.ExitCode(1),
            })
          })
      ),
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Harden was cancelled.")

          return yield* new CommandFailed({
            command: "harden",
            exitCode: ChildProcessSpawner.ExitCode(1),
          })
        })
      )
    )
  )
)

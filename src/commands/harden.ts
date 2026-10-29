import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { assessProject } from "#lib/assessment/index.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { readHardenContext, renderHardenPrompt } from "#lib/hardening/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readCustomRuleTestCommand } from "#lib/workspace/custom-rules/index.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { chooseResolution } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

const scope = Flag.Directory("path", { mustExist: true }).pipe(
  Flag.optional,
  Flag.withDescription(
    "Limit the session to one workspace package or folder of the project, relative to the current directory"
  )
)

export default Command.make("harden", { scope }).pipe(
  Command.withDescription(
    "Ask a coding agent to turn the project's coding standards into custom rules and instructions"
  ),
  Command.withHandler(({ scope }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const path = yield* Path.Path
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      const failBeforeStart = Effect.fn("failBeforeStart")(function* (message: string) {
        if (isInteractive) {
          yield* prompter.log.warning(message)
          yield* prompter.outro("⚠️ Harden did not start.")
        } else {
          yield* prompter.message(message)
        }
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      })

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite harden")
      }

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        return yield* failBeforeStart(
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`."
        )
      }

      const scopeDirectory = Option.isSome(scope) ? path.resolve(cwd, scope.value) : undefined

      if (scopeDirectory !== undefined) {
        const fromRoot = path.relative(cwd, scopeDirectory)

        if (
          fromRoot === ".."
          || fromRoot.startsWith(`..${path.sep}`)
          || path.isAbsolute(fromRoot)
        ) {
          return yield* failBeforeStart(
            `\`--path\` must be a folder inside the project. \`${scopeDirectory}\` is outside \`${cwd}\`.`
          )
        }
      }

      const context = yield* readHardenContext(cwd, scopeDirectory)
      const prompt = renderHardenPrompt(context, version)

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

      if (resolution._tag !== "Ended") {
        yield* prompter.outro("✅ Harden completed.")
        return
      }

      const { agent } = resolution
      const runner = yield* CommandRunner
      // A step that fails or cannot start fails the verification, and the later steps still run.
      const passes = (step: ReturnType<typeof runner.run>) =>
        step.pipe(
          Effect.as(true),
          Effect.catchTags({
            CliNotFound: (error) => prompter.log.error(error.message).pipe(Effect.as(false)),
            CommandFailed: () => Effect.succeed(false),
          })
        )
      // The agent's exit code says nothing about the project, so `check`, the rule tests, and the
      // assessment decide.
      const checkPassed = yield* passes(
        runner.runAll([
          { args: ["--check"], command: oxfmt.name, title: "✨ Checking formatting" },
          { args: [], command: oxlint.name, title: "🔍 Linting" },
        ])
      )
      // The Doctor warnings below already name the rules folders that discovery cannot follow.
      const { command: ruleTestCommand } = yield* readCustomRuleTestCommand(cwd)
      // `rule test` passes when the project has no rule tests.
      const ruleTestPassed = Option.isNone(ruleTestCommand)
        ? true
        : yield* passes(
            Console.log("").pipe(
              Effect.andThen(
                runner.run({ ...ruleTestCommand.value, title: "🧪 Testing custom rules" })
              )
            )
          )
      const assessment = yield* assessProject(cwd)

      for (const warning of assessment.warnings) {
        yield* prompter.log.warning(warning)
      }

      if (!checkPassed) {
        yield* prompter.log.error(`\`adamantite check\` failed after the ${agent.name} session.`)
      }

      if (!ruleTestPassed) {
        yield* prompter.log.error(
          `\`adamantite rule test\` failed after the ${agent.name} session.`
        )
      }

      if (assessment.findings.length > 0) {
        yield* prompter.log.warning(`Doctor found issues after the ${agent.name} session.`)
        yield* printFindings(assessment.findings)
      }

      if (!checkPassed || !ruleTestPassed || assessment.findings.length > 0) {
        yield* prompter.outro("⚠️ Harden verification failed.")
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      yield* prompter.log.success(
        `\`adamantite check\`, \`adamantite rule test\`, and Doctor pass after the ${agent.name} session.`
      )
      yield* prompter.outro("✅ Harden completed successfully!")
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Harden was cancelled. Nothing was changed.")
          return yield* new CommandFailed({
            command: "harden",
            exitCode: ChildProcessSpawner.ExitCode(1),
          })
        })
      )
    )
  )
)

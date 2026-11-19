import type * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { stripVTControlCharacters } from "node:util"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as String from "effect/String"

const MAX_CAUSE_OUTPUT_LINES = 20

function causeLines(cause: unknown) {
  return Predicate.isError(cause)
    ? pipe(
        stripVTControlCharacters(cause.message),
        String.split(/\r\n|[\r\n]/),
        Array.map((line) => String.trimEnd(line)),
        Array.filter((line) => String.isNonEmpty(line))
      )
    : []
}

function formatCauseDetail(cause: unknown) {
  return pipe(
    causeLines(cause),
    Array.head,
    Option.map((line) => {
      const detail = String.trim(line)

      return /[.!?]$/.test(detail) ? ` Cause: ${detail}` : ` Cause: ${detail}.`
    }),
    Option.getOrElse(() => "")
  )
}

function formatCauseOutput(cause: unknown) {
  const lines = causeLines(cause)

  if (!Array.isReadonlyArrayNonEmpty(lines)) {
    return ""
  }

  const tail = Array.takeRight(lines, MAX_CAUSE_OUTPUT_LINES)
  const shown = tail.length < lines.length ? ["…", ...tail] : tail

  return `\n${shown.join("\n")}`
}

export class AdamantiteNotInstalled extends Data.TaggedError("AdamantiteNotInstalled")<{
  command: string
}> {
  override get message() {
    return `\`adamantite\` is not installed in this project. Install it before running \`adamantite ${this.command}\`.`
  }
}

export class AdamantiteNotInNodeModules extends Data.TaggedError("AdamantiteNotInNodeModules")<{
  command: string
}> {
  override get message() {
    return `\`adamantite\` is in \`package.json\` but not in \`node_modules\`. Install the dependencies before running \`adamantite ${this.command}\`.`
  }
}

export class AdamantiteVersionMismatch extends Data.TaggedError("AdamantiteVersionMismatch")<{
  command: string
  installed: string
  running: string
}> {
  override get message() {
    return `This project installs Adamantite ${this.installed}, but this command is Adamantite ${this.running}. Run the project's own Adamantite, such as \`pnpm exec adamantite ${this.command}\`, or install the dependencies again.`
  }
}

export class ScopeOutsideProject extends Data.TaggedError("ScopeOutsideProject")<{
  cwd: string
  scope: string
}> {
  override get message() {
    return `\`--path\` must be a folder inside the project. \`${this.scope}\` is outside \`${this.cwd}\`.`
  }
}

export class CliNotFound extends Data.TaggedError("CliNotFound")<{
  command: string
  hint?: string
}> {
  override get message() {
    return `The command \`${this.command}\` was not found on PATH. ${this.hint ?? "Install it, then run the command again."}`
  }
}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  command: string
  exitCode: ChildProcessSpawner.ExitCode
  output?: string
}> {
  override get message() {
    const output = this.output?.trim() ?? ""

    return `Command \`${this.command}\` failed with exit code ${this.exitCode}.${output === "" ? "" : `\n${output}`}`
  }
}

export class CustomRuleExists extends Data.TaggedError("CustomRuleExists")<{
  paths: readonly string[]
}> {
  override get message() {
    const files = this.paths.map((path) => `\`${path}\``).join(" and ")

    return this.paths.length === 1
      ? `${files} already exists. Choose another name, or edit the file.`
      : `${files} already exist. Choose another name, or edit the files.`
  }
}

export class CustomRuleNotFound extends Data.TaggedError("CustomRuleNotFound")<{
  directory: string
  rule: string
}> {
  override get message() {
    return `Rule \`${this.rule}\` does not exist in \`${this.directory}\`. Create the rule before adding its test.`
  }
}

export class EffectBuildMissing extends Data.TaggedError("EffectBuildMissing")<{
  effectVersion: string
  supported: readonly string[]
  tool: "oxlint" | "tsrs"
  version: string
}> {
  override get message() {
    const builds =
      this.supported.length === 0
        ? `has no builds of ${this.tool}`
        : `has builds for ${this.tool} ${this.supported.join(", ")}`

    return `The effect preset needs the @effect/tsgo build of ${this.tool} ${this.version}. @effect/tsgo ${this.effectVersion} ${builds}. Run \`adamantite update\`.`
  }
}

export class EffectOxlintBridgeMissing extends Data.TaggedError("EffectOxlintBridgeMissing")<{
  effectVersion: string
}> {
  override get message() {
    return `The effect preset needs \`@effect/tsgo/oxlint-bridge\`, which @effect/tsgo ${this.effectVersion} does not ship. Run \`adamantite update\`.`
  }
}

export class EffectPlatformUnsupported extends Data.TaggedError("EffectPlatformUnsupported")<{
  platform: string
}> {
  override get message() {
    return `@effect/tsgo has no Effect build of Oxlint for ${this.platform}, so Oxlint cannot load the effect preset here.`
  }
}

export class EffectEditorUnavailable extends Data.TaggedError("EffectEditorUnavailable")<{
  reason: string
}> {
  override get message() {
    return this.reason
  }
}

export class FailedToCreateDirectory extends Data.TaggedError("FailedToCreateDirectory")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target directory"

    return `Could not create ${target}. Check the parent directory permissions, then try again.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToFormatFile extends Data.TaggedError("FailedToFormatFile")<{
  output: string
  path: string
}> {
  override get message() {
    return `The project's Oxfmt could not format \`${this.path}\`. Fix the Oxfmt config, then run the command again.${this.output === "" ? "" : `\n${this.output}`}`
  }
}

export class FailedToInstallDependency extends Data.TaggedError("FailedToInstallDependency")<{
  packages?: string[]
  cause?: unknown
}> {
  override get message() {
    const target = this.packages?.length ? `: ${this.packages.join(", ")}` : ""

    return `Failed to install dependencies${target}.${formatCauseOutput(this.cause)}`
  }
}

export class FailedToParseFile extends Data.TaggedError("FailedToParseFile")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse \`${this.path}\`. Fix the JSON or JSONC syntax and run the command again.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToParseYaml extends Data.TaggedError("FailedToParseYaml")<{
  path: string
  cause: unknown
}> {
  override get message() {
    return `Failed to parse \`${this.path}\`.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToParseSource extends Data.TaggedError("FailedToParseSource")<{
  path: string
  errors: readonly string[]
}> {
  override get message() {
    return [
      `Could not parse \`${this.path}\`. Fix the syntax and run the command again.`,
      ...this.errors.map((error) => `- ${error}`),
    ].join("\n")
  }
}

export class FailedToReadFile extends Data.TaggedError("FailedToReadFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"

    return `Could not read ${target}. Check that the file exists and is readable, then try again.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToWriteFile extends Data.TaggedError("FailedToWriteFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"

    return `Could not write ${target}. Check the directory permissions and available disk space, then try again.${formatCauseDetail(this.cause)}`
  }
}

export class InvalidConfigFormat extends Data.TaggedError("InvalidConfigFormat")<{
  path?: string
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target config file"

    return `The config in ${target} must be a JSON object, such as {}.`
  }
}

export class ProjectCopyFailed extends Data.TaggedError("ProjectCopyFailed")<{
  cause?: unknown
}> {
  override get message() {
    return `Could not copy the project to a temporary folder for the trial. Check the free disk space and the permissions of the temporary folder, then try again.${formatCauseDetail(this.cause)}`
  }
}

export class InvalidPackageJson extends Data.TaggedError("InvalidPackageJson")<{
  issue: string
  path: string
}> {
  override get message() {
    return `\`${this.path}\` is not a valid \`package.json\`. ${this.issue}`
  }
}

export class InvalidLockfile extends Data.TaggedError("InvalidLockfile")<{
  issue: string
  path: string
}> {
  override get message() {
    return `\`${this.path}\` does not decode as an Adamantite lockfile. Run \`adamantite doctor\` to hand the repair to a coding agent. ${this.issue}`
  }
}

export class SetupOutdated extends Data.TaggedError("SetupOutdated")<{
  installed: string
  path: string
  recorded: string
}> {
  override get message() {
    return `\`${this.path}\` records the setup of Adamantite ${this.recorded}, but the project installs Adamantite ${this.installed}. Run the project's installed \`adamantite update\` through its package runner, such as \`pnpm exec adamantite update\`, to update the managed packages, files, and skill, commit the changes, and run \`adamantite check\` again.`
  }
}

export class SetupAhead extends Data.TaggedError("SetupAhead")<{
  installed: string
  path: string
  recorded: string
}> {
  override get message() {
    return `\`${this.path}\` records the setup of Adamantite ${this.recorded}, but the project installs the older Adamantite ${this.installed}. Install the dependencies, or update the project's \`adamantite\` dependency to ${this.recorded} or newer, and run \`adamantite check\` again.`
  }
}

export class UnsupportedLockfile extends Data.TaggedError("UnsupportedLockfile")<{
  path: string
  schemaVersion: unknown
  version: Option.Option<string>
}> {
  override get message() {
    const writer = Option.match(this.version, {
      onNone: () => "A newer Adamantite version wrote it.",
      onSome: (version) => `Adamantite ${version} wrote it.`,
    })

    return `\`${this.path}\` has schema version ${JSON.stringify(this.schemaVersion)}, which this Adamantite version cannot read. ${writer} Run \`adamantite doctor\` to hand the repair to a coding agent.`
  }
}

export class ParentOxlintConfig extends Data.TaggedError("ParentOxlintConfig")<{
  path: string
}> {
  override get message() {
    return `Init made no changes, because \`${this.path}\` lints this folder, and Oxlint accepts \`options\` only in the root config. Run \`adamantite init\` at the root of that project, or extend the root config in this folder, as "Custom rules in a monorepo" in the Adamantite README shows.`
  }
}

export class InvalidAnalyzeOptions extends Data.TaggedError("InvalidAnalyzeOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid analyze options. ${this.reason}`
  }
}

export class InvalidCheckOptions extends Data.TaggedError("InvalidCheckOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid check options. ${this.reason}`
  }
}

export class InvalidFixOptions extends Data.TaggedError("InvalidFixOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid fix options. ${this.reason}`
  }
}

export class InvalidInitOptions extends Data.TaggedError("InvalidInitOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid init options. ${this.reason}`
  }
}

export class InvalidTrialCase extends Data.TaggedError("InvalidTrialCase")<{
  reason: string
  value: string
}> {
  override get message() {
    return `Invalid case \`${this.value}\`. ${this.reason}`
  }
}

export class InvalidTrialOptions extends Data.TaggedError("InvalidTrialOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid trial options. ${this.reason}`
  }
}

export class InvalidRuleName extends Data.TaggedError("InvalidRuleName")<{
  rule: string
}> {
  override get message() {
    return `Invalid rule name \`${this.rule}\`. Use kebab-case that starts with a letter, such as \`no-process-env\`.`
  }
}

export class NoPackageManager extends Data.TaggedError("NoPackageManager")<{
  cause?: unknown
}> {
  override get message() {
    return `No package manager was found. Run this command from a project with a lockfile or a \`packageManager\` field in \`package.json\`.${formatCauseDetail(this.cause)}`
  }
}

export class MissingPackageVersion extends Data.TaggedError("MissingPackageVersion")<{
  path?: string
  dependency?: string
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "package.json"

    if (this.dependency) {
      return `Missing \`${this.dependency}\` in ${target} dependencies or devDependencies.`
    }

    return `Missing version field in ${target}.`
  }
}

export class PackageNotInstalled extends Data.TaggedError("PackageNotInstalled")<{
  packageName: string
  project: string
}> {
  override get message() {
    return `\`${this.packageName}\` is not installed in \`${this.project}\`. Install the dependencies, or run \`adamantite update\`.`
  }
}

export class ToolNotSelected extends Data.TaggedError("ToolNotSelected")<{
  script: string
  tool: string
}> {
  override get message() {
    return `The lockfile selects no script that runs \`${this.tool}\`, so \`${this.tool}\` is not installed. Run \`adamantite init --non-interactive --script ${this.script}\` to add the script and install it.`
  }
}

export class PassthroughNotSupported extends Data.TaggedError("PassthroughNotSupported")<{
  command: string
}> {
  override get message() {
    return `\`adamantite ${this.command}\` does not accept arguments after \`--\`. Use the command options instead.`
  }
}

export class TrialCaseIgnored extends Data.TaggedError("TrialCaseIgnored")<{
  path: string
}> {
  override get message() {
    return `The trial could not check this case because the Oxlint config ignores \`${this.path}\`. Put the case at a path that the config lints.`
  }
}

export class TrialCaseUnparsable extends Data.TaggedError("TrialCaseUnparsable")<{
  errors: readonly string[]
  path: string
}> {
  override get message() {
    return [
      `Oxlint could not parse the trial case \`${this.path}\`. Fix the syntax and run the trial again.`,
      ...this.errors.map((error) => `- ${error}`),
    ].join("\n")
  }
}

export class TrialConfigNotFound extends Data.TaggedError("TrialConfigNotFound")<{
  path: string
}> {
  override get message() {
    return `No Oxlint config applies to \`${this.path}\`. Configure linting with \`adamantite init\`, then run the trial again.`
  }
}

export class ConfigLoadFailed extends Data.TaggedError("ConfigLoadFailed")<{
  file: string
  reason: string
}> {
  override get message() {
    return `Node.js cannot load \`${this.file}\`: ${this.reason}`
  }
}

export class OxlintProbeFailed extends Data.TaggedError("OxlintProbeFailed")<{
  output: string
}> {
  override get message() {
    return `Oxlint could not read the files. Fix the errors below and run the command again.\n${this.output}`
  }
}

export class TrialLintFailed extends Data.TaggedError("TrialLintFailed")<{
  output: string
}> {
  override get message() {
    return `Oxlint could not run the trial. Fix the errors below and run it again.\n${this.output}`
  }
}

export class TrialProjectUnlisted extends Data.TaggedError("TrialProjectUnlisted")<{
  cwd: string
}> {
  override get message() {
    return `The trial needs Git to list the files of \`${this.cwd}\`. Run it in a Git repository.`
  }
}

export class TrialRuleNotFound extends Data.TaggedError("TrialRuleNotFound")<{
  detail: string
  rule: string
}> {
  override get message() {
    return `The rule \`${this.rule}\` is not available. Check that the Oxlint config loads it. Oxlint reports: ${this.detail}`
  }
}

import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { ParseError } from "jsonc-parser"
import { stripVTControlCharacters } from "node:util"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as String from "effect/String"
import { printParseErrorCode } from "jsonc-parser"

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
    Option.map((line) => ` Cause: ${String.trim(line)}`),
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

function formatParseErrors(errors: ParseError[] = []) {
  if (errors.length === 0) {
    return "- Unknown JSON/JSONC parsing error"
  }

  return errors
    .slice(0, 3)
    .map((error) => `- ${printParseErrorCode(error.error)} (offset: ${error.offset})`)
    .join("\n")
}

export class CliNotFound extends Data.TaggedError("CliNotFound")<{ command: string }> {
  override get message() {
    return `Command \`${this.command}\` not found. Please install it and try again.`
  }
}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  command: string
  exitCode: ChildProcessSpawner.ExitCode
}> {
  override get message() {
    return `Command \`${this.command}\` failed with exit code ${this.exitCode}.`
  }
}

export class FailedToCreateDirectory extends Data.TaggedError("FailedToCreateDirectory")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target directory"
    return `Failed to create directory ${target}.${formatCauseDetail(this.cause)}`
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

export class FailedToInstallExtension extends Data.TaggedError("FailedToInstallExtension")<{
  extension?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.extension ? `\`${this.extension}\`` : "the target extension"

    if (Predicate.isNumber(this.cause)) {
      return `Failed to install ${target}. The \`code\` CLI exited with code ${this.cause}.`
    }

    return `Failed to install ${target}.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToMergeConfig extends Data.TaggedError("FailedToMergeConfig")<{
  cause?: unknown
}> {
  override get message() {
    return `Failed to merge configuration.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToParseFile extends Data.TaggedError("FailedToParseFile")<{
  path?: string
  errors?: ParseError[]
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"

    return [
      `Failed to parse ${target}.`,
      "Please fix the JSON/JSONC syntax and run the command again.",
      "",
      "Parse details:",
      formatParseErrors(this.errors),
    ].join("\n")
  }
}

export class FailedToReadFile extends Data.TaggedError("FailedToReadFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"
    return `Failed to read ${target}.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToDeleteFile extends Data.TaggedError("FailedToDeleteFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"
    return `Failed to delete ${target}.${formatCauseDetail(this.cause)}`
  }
}

export class FailedToWriteFile extends Data.TaggedError("FailedToWriteFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"
    return `Failed to write ${target}.${formatCauseDetail(this.cause)}`
  }
}

export class FileNotFound extends Data.TaggedError("FileNotFound")<{ path?: string }> {
  override get message() {
    return this.path ? `File not found: \`${this.path}\`.` : "File not found."
  }
}

export class InvalidConfigFormat extends Data.TaggedError("InvalidConfigFormat")<{
  path?: string
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target config file"

    return `Invalid config format in ${target}. The config must be a JSON object (for example: {}).`
  }
}

export class InvalidInitOptions extends Data.TaggedError("InvalidInitOptions")<{
  reason: string
}> {
  override get message() {
    return `Invalid init options. ${this.reason}`
  }
}

export class UnsupportedConfigState extends Data.TaggedError("UnsupportedConfigState")<{
  path?: string
  reason?: string
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target config file"
    const detail = this.reason ? ` ${this.reason}` : ""

    return `Unsupported config state in ${target}.${detail}`
  }
}

export class NoPackageManager extends Data.TaggedError("NoPackageManager")<{
  cause?: unknown
}> {
  override get message() {
    return `No package manager detected. Please run this command from a project with a lockfile.${formatCauseDetail(this.cause)}`
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

export class MigrationValidationFailed extends Data.TaggedError("MigrationValidationFailed")<{
  migrationId: string
  reason: string
}> {
  override get message() {
    return `Migration \`${this.migrationId}\` validation failed. ${this.reason}`
  }
}

export class OperationCancelled extends Data.TaggedError("OperationCancelled")<{
  reason?: string
}> {
  override get message() {
    const detail = this.reason ? ` Reason: ${this.reason}` : ""
    return `Operation cancelled.${detail}`
  }
}

export class PassthroughNotSupported extends Data.TaggedError("PassthroughNotSupported")<{
  command: string
}> {
  override get message() {
    return `Command \`adamantite ${this.command}\` does not invoke a single underlying CLI and cannot accept passthrough arguments.`
  }
}

export class VscodeCliNotFound extends Data.TaggedError("VscodeCliNotFound")<{
  cause?: unknown
}> {
  override get message() {
    return `VS Code CLI (\`code\`) not found. Please install it to manage extensions.${formatCauseDetail(this.cause)}`
  }
}

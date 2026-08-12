import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { ParseError } from "jsonc-parser"
import * as Data from "effect/Data"
import { printParseErrorCode } from "jsonc-parser"

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
    return `Failed to create directory ${target}.`
  }
}

export class FailedToInstallDependency extends Data.TaggedError("FailedToInstallDependency")<{
  packages?: string[]
  cause?: unknown
}> {
  override get message() {
    const target = this.packages?.length ? `: ${this.packages.join(", ")}` : ""
    return `Failed to install dependencies${target}.`
  }
}

export class FailedToInstallExtension extends Data.TaggedError("FailedToInstallExtension")<{
  extension?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.extension ? `\`${this.extension}\`` : "the target extension"
    return `Failed to install ${target}.`
  }
}

export class FailedToMergeConfig extends Data.TaggedError("FailedToMergeConfig")<{
  cause?: unknown
}> {
  override get message() {
    const detail = this.cause instanceof Error ? ` Cause: ${this.cause.message}` : ""
    return `Failed to merge configuration.${detail}`
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
    return `Failed to read ${target}.`
  }
}

export class FailedToDeleteFile extends Data.TaggedError("FailedToDeleteFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"
    return `Failed to delete ${target}.`
  }
}

export class FailedToWriteFile extends Data.TaggedError("FailedToWriteFile")<{
  path?: string
  cause?: unknown
}> {
  override get message() {
    const target = this.path ? `\`${this.path}\`` : "the target file"
    return `Failed to write ${target}.`
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
    const detail = this.cause instanceof Error ? ` Cause: ${this.cause.message}` : ""
    return `No package manager detected. Please run this command from a project with a lockfile.${detail}`
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
    const detail = this.cause instanceof Error ? ` Cause: ${this.cause.message}` : ""
    return `VS Code CLI (\`code\`) not found. Please install it to manage extensions.${detail}`
  }
}

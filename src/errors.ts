import type { ParseError } from "jsonc-parser"
import * as Data from "effect/Data"

export class CliNotFound extends Data.TaggedError("CliNotFound")<{ command: string }> {}

export class CommandFailed extends Data.TaggedError("CommandFailed")<{
  command: string
  exitCode: number
}> {}

export class FailedToCreateDirectory extends Data.TaggedError("FailedToCreateDirectory")<{
  path?: string
  cause?: unknown
}> {}

export class FailedToInstallDependency extends Data.TaggedError("FailedToInstallDependency")<{
  packages?: string[]
  cause?: unknown
}> {}

export class FailedToInstallExtension extends Data.TaggedError("FailedToInstallExtension")<{
  extension?: string
  cause?: unknown
}> {}

export class FailedToMergeConfig extends Data.TaggedError("FailedToMergeConfig")<{
  cause?: unknown
}> {}

export class FailedToParseFile extends Data.TaggedError("FailedToParseFile")<{
  path?: string
  errors?: ParseError[]
}> {}

export class FailedToReadFile extends Data.TaggedError("FailedToReadFile")<{
  path?: string
  cause?: unknown
}> {}

export class FailedToWriteFile extends Data.TaggedError("FailedToWriteFile")<{
  path?: string
  cause?: unknown
}> {}

export class FileNotFound extends Data.TaggedError("FileNotFound")<{ path?: string }> {}

export class InvalidConfigFormat extends Data.TaggedError("InvalidConfigFormat")<{
  path?: string
}> {}

export class NoPackageManager extends Data.TaggedError("NoPackageManager")<{
  cause?: unknown
}> {}

export class MissingPackageVersion extends Data.TaggedError("MissingPackageVersion")<{
  path?: string
}> {}

export class OperationCancelled extends Data.TaggedError("OperationCancelled")<{
  reason?: string
}> {}

export class UnknownScript extends Data.TaggedError("UnknownScript")<{ script: string }> {}

export class VscodeCliNotFound extends Data.TaggedError("VscodeCliNotFound")<{
  cause?: unknown
}> {}

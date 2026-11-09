import * as PlatformError from "effect/PlatformError"

export const notFound = PlatformError.systemError({
  _tag: "NotFound",
  method: "readFile",
  module: "FileSystem",
})

export const reason = new PlatformError.SystemError({
  _tag: "PermissionDenied",
  method: "writeFile",
  module: "FileSystem",
})

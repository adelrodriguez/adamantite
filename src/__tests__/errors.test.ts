import type { ParseError } from "jsonc-parser"
import { describe, expect, it } from "@effect/vitest"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { parse, printParseErrorCode } from "jsonc-parser"
import {
  CommandFailed,
  FailedToInstallDependency,
  FailedToInstallExtension,
  FailedToParseFile,
  FailedToReadFile,
  FailedToWriteFile,
} from "#lib/shared/errors.ts"

function createParseErrors(count: number): ParseError[] {
  const errors: ParseError[] = []
  parse("{ invalid", errors)

  const [firstError] = errors
  if (!firstError) {
    throw new Error("Expected jsonc-parser to produce at least one parse error")
  }

  return Array.from({ length: count }, (_, index) => ({
    ...firstError,
    offset: firstError.offset + index,
  }))
}

describe("errors", () => {
  describe("FailedToParseFile", () => {
    it("use a fallback parse message when there are no parse errors", () => {
      const error = new FailedToParseFile({ errors: [], path: "foo.json" })

      expect(error.message).toContain("Unknown JSON/JSONC parsing error")
    })

    it("include up to three parse errors with offsets and codes", () => {
      expect.assertions(6)

      const errors = createParseErrors(3)
      const error = new FailedToParseFile({ errors, path: "foo.json" })

      for (const parseError of errors) {
        expect(error.message).toContain(printParseErrorCode(parseError.error))
        expect(error.message).toContain(`offset: ${parseError.offset}`)
      }
    })

    it("truncate parse details after the first three errors", () => {
      const errors = createParseErrors(4)
      const error = new FailedToParseFile({ errors, path: "foo.json" })

      expect(error.message).toContain(`offset: ${errors[0]?.offset}`)
      expect(error.message).toContain(`offset: ${errors[1]?.offset}`)
      expect(error.message).toContain(`offset: ${errors[2]?.offset}`)
      expect(error.message).not.toContain(`offset: ${errors[3]?.offset}`)
    })
  })

  describe("FailedToInstallDependency", () => {
    it("include the package manager output from the cause", () => {
      const cause = new Error(
        [
          "`pnpm add -D adamantite` failed.",
          "",
          " ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)",
          'Your Node version is incompatible with "adamantite@0.34.4".',
          "Expected version: >=24",
          "Got: v22.22.0",
        ].join("\n")
      )
      const error = new FailedToInstallDependency({ cause, packages: ["adamantite"] })

      expect(error.message).toContain("Failed to install dependencies: adamantite.")
      expect(error.message).toContain("ERR_PNPM_UNSUPPORTED_ENGINE")
      expect(error.message).toContain("Expected version: >=24")
      expect(error.message).not.toContain("\n\n")
    })

    it("strip ANSI escape codes and carriage returns from the cause output", () => {
      const cause = new Error("\u001B[31mERR_PNPM_FETCH_404\u001B[39m\rretrying...\r\ndone")
      const error = new FailedToInstallDependency({ cause })

      expect(error.message).toContain("ERR_PNPM_FETCH_404")
      expect(error.message).toContain("retrying...")
      expect(error.message).not.toContain("\u001B")
      expect(error.message).not.toContain("\r")
    })

    it("truncate long cause output to the last 20 lines", () => {
      const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
      const cause = new Error(lines.join("\n"))
      const error = new FailedToInstallDependency({ cause })

      expect(error.message).toContain("…")
      expect(error.message).toContain("line 30")
      expect(error.message).toContain("line 11")
      expect(error.message).not.toContain("line 10\n")
    })

    it("ignore causes that are not Error instances", () => {
      const error = new FailedToInstallDependency({ cause: "boom" })

      expect(error.message).toBe("Failed to install dependencies.")
    })
  })

  describe("FailedToWriteFile", () => {
    it("include the cause detail when the cause is an Error", () => {
      const cause = new Error("PermissionDenied: FileSystem.writeFile (/repo/oxlint.json)")
      const error = new FailedToWriteFile({ cause, path: "/repo/oxlint.json" })

      expect(error.message).toBe(
        "Failed to write `/repo/oxlint.json`. Cause: PermissionDenied: FileSystem.writeFile (/repo/oxlint.json)."
      )
    })

    it("do not double the period when the cause already ends with one", () => {
      const cause = new Error("Something went wrong.")
      const error = new FailedToWriteFile({ cause, path: "/repo/oxlint.json" })

      expect(error.message).toBe(
        "Failed to write `/repo/oxlint.json`. Cause: Something went wrong."
      )
    })

    it("keep only the first line of a multi-line cause", () => {
      const cause = new Error("first line\nsecond line")
      const error = new FailedToWriteFile({ cause, path: "/repo/oxlint.json" })

      expect(error.message).toContain("Cause: first line")
      expect(error.message).not.toContain("second line")
    })
  })

  describe("FailedToReadFile", () => {
    it("fall back to a plain message when the cause is missing", () => {
      const error = new FailedToReadFile({ path: "/repo/tsconfig.json" })

      expect(error.message).toBe("Failed to read `/repo/tsconfig.json`.")
    })
  })

  describe("FailedToInstallExtension", () => {
    it("report the exit code when the cause is a number", () => {
      const error = new FailedToInstallExtension({ cause: 1, extension: "oxc.oxc-vscode" })

      expect(error.message).toBe(
        "Failed to install `oxc.oxc-vscode`. The `code` CLI exited with code 1."
      )
    })

    it("include the cause detail when the cause is an Error", () => {
      const cause = new Error("SystemError: spawn code EAGAIN")
      const error = new FailedToInstallExtension({ cause, extension: "oxc.oxc-vscode" })

      expect(error.message).toBe(
        "Failed to install `oxc.oxc-vscode`. Cause: SystemError: spawn code EAGAIN."
      )
    })
  })

  describe("CommandFailed", () => {
    it("include the command and exit code in the message", () => {
      const error = new CommandFailed({
        command: "oxlint",
        exitCode: ChildProcessSpawner.ExitCode(2),
      })

      expect(error.message).toBe("Command `oxlint` failed with exit code 2.")
    })
  })
})

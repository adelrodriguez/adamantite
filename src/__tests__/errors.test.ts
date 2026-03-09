import { describe, expect, test } from "bun:test"
import type { ParseError } from "jsonc-parser"
import { parse, printParseErrorCode } from "jsonc-parser"
import {
  CliNotFound,
  CommandFailed,
  FailedToInstallDependency,
  FailedToParseFile,
  FileNotFound,
} from "#errors.ts"

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
    test("use a fallback parse message when there are no parse errors", () => {
      const error = new FailedToParseFile({ errors: [], path: "foo.json" })

      expect(error.message).toContain("Unknown JSON/JSONC parsing error")
    })

    test("include up to three parse errors with offsets and codes", () => {
      const errors = createParseErrors(3)
      const error = new FailedToParseFile({ errors, path: "foo.json" })

      for (const parseError of errors) {
        expect(error.message).toContain(printParseErrorCode(parseError.error))
        expect(error.message).toContain(`offset: ${parseError.offset}`)
      }
    })

    test("truncate parse details after the first three errors", () => {
      const errors = createParseErrors(4)
      const error = new FailedToParseFile({ errors, path: "foo.json" })

      expect(error.message).toContain(`offset: ${errors[0]?.offset}`)
      expect(error.message).toContain(`offset: ${errors[1]?.offset}`)
      expect(error.message).toContain(`offset: ${errors[2]?.offset}`)
      expect(error.message).not.toContain(`offset: ${errors[3]?.offset}`)
    })
  })

  describe("FailedToInstallDependency", () => {
    test("list the packages when they are provided", () => {
      const error = new FailedToInstallDependency({
        packages: ["oxlint@1.50.0", "oxfmt@0.35.0"],
      })

      expect(error.message).toContain("oxlint@1.50.0, oxfmt@0.35.0")
    })

    test("fall back to a generic message when packages are omitted", () => {
      const error = new FailedToInstallDependency({})

      expect(error.message).toBe("Failed to install dependencies.")
    })
  })

  describe("CommandFailed", () => {
    test("include the command and exit code in the message", () => {
      const error = new CommandFailed({
        command: "oxlint",
        exitCode: 2 as never,
      })

      expect(error.message).toBe("Command `oxlint` failed with exit code 2.")
    })
  })

  describe("tags", () => {
    test("preserve tagged error names", () => {
      expect(new CliNotFound({ command: "oxlint" })._tag).toBe("CliNotFound")
      expect(new FileNotFound({ path: "/foo" })._tag).toBe("FileNotFound")
    })
  })
})

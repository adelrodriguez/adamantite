import { describe, expect, it } from "@effect/vitest"
import {
  CustomRuleExists,
  FailedToInstallDependency,
  FailedToInstallExtension,
  FailedToParseFile,
  FailedToReadFile,
  FailedToWriteFile,
  JsoncNotEditable,
  ProjectCopyFailed,
} from "#lib/shared/errors.ts"

describe("errors", () => {
  describe("ProjectCopyFailed", () => {
    it("say that the trial copy failed, with the cause, instead of a file path", () => {
      expect(
        new ProjectCopyFailed({ cause: new Error("ENOSPC: no space left on device") }).message
      ).toBe(
        "Could not copy the project to a temporary folder for the trial. Check the free disk space and the permissions of the temporary folder, then try again. Cause: ENOSPC: no space left on device."
      )
    })
  })

  describe("CustomRuleExists", () => {
    it("name the one file that exists", () => {
      expect(new CustomRuleExists({ paths: ["rules/tests/no-foo.ts"] }).message).toBe(
        "`rules/tests/no-foo.ts` already exists. Choose another name, or edit the file."
      )
    })

    it("name each file that exists", () => {
      expect(
        new CustomRuleExists({ paths: ["rules/no-foo.ts", "rules/tests/no-foo.ts"] }).message
      ).toBe(
        "`rules/no-foo.ts` and `rules/tests/no-foo.ts` already exist. Choose another name, or edit the files."
      )
    })
  })

  describe("FailedToParseFile", () => {
    it("name the file and the position of the syntax error", () => {
      const error = new FailedToParseFile({
        cause: new Error("Invalid JSONC at line 4, column 5"),
        path: "tsconfig.json",
      })

      expect(error.message).toBe(
        "Failed to parse `tsconfig.json`. Fix the JSON or JSONC syntax and run the command again. Cause: Invalid JSONC at line 4, column 5."
      )
    })
  })

  describe("JsoncNotEditable", () => {
    it("say why the file stays as it is and what to do", () => {
      const error = new JsoncNotEditable({
        change: 'Set `extends` to `"adamantite/typescript"`.',
        path: "tsconfig.json",
      })

      expect(error.message).toBe(
        '`tsconfig.json` has comments or trailing commas, so Adamantite does not rewrite it. Set `extends` to `"adamantite/typescript"`.'
      )
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
        "Could not write `/repo/oxlint.json`. Check the directory permissions and available disk space, then try again. Cause: PermissionDenied: FileSystem.writeFile (/repo/oxlint.json)."
      )
    })

    it("do not double the period when the cause already ends with one", () => {
      const cause = new Error("Something went wrong.")
      const error = new FailedToWriteFile({ cause, path: "/repo/oxlint.json" })

      expect(error.message).toBe(
        "Could not write `/repo/oxlint.json`. Check the directory permissions and available disk space, then try again. Cause: Something went wrong."
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

      expect(error.message).toBe(
        "Could not read `/repo/tsconfig.json`. Check that the file exists and is readable, then try again."
      )
    })
  })

  describe("FailedToInstallExtension", () => {
    it("report the exit code when the cause is a number", () => {
      const error = new FailedToInstallExtension({ cause: 1, extension: "oxc.oxc-vscode" })

      expect(error.message).toBe(
        "Failed to install `oxc.oxc-vscode`. The `code` CLI exited with code 1."
      )
    })
  })
})

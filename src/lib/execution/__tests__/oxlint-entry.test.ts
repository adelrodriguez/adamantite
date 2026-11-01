import { describe, expect, it } from "@effect/vitest"
import { getProjectDirectory, OXLINT_COMMAND } from "#lib/execution/oxlint-entry.ts"

const CWD = "/somewhere/else"

describe("oxlint-entry", () => {
  describe("getProjectDirectory", () => {
    it("take the folder above node_modules for an installed entry", () => {
      expect(getProjectDirectory("/project/node_modules/adamantite/dist/oxlint.js", CWD)).toBe(
        "/project"
      )
    })

    it("take the folder above the first node_modules for an entry in the pnpm store", () => {
      expect(
        getProjectDirectory(
          "/project/node_modules/.pnpm/adamantite@1.0.0/node_modules/adamantite/dist/oxlint.js",
          CWD
        )
      ).toBe("/project")
    })

    it("take the workspace package that installs the entry", () => {
      expect(
        getProjectDirectory("/project/packages/web/node_modules/adamantite/dist/oxlint.js", CWD)
      ).toBe("/project/packages/web")
    })

    it("take the folder above node_modules for a Windows path", () => {
      expect(
        getProjectDirectory("C:\\project\\node_modules\\adamantite\\dist\\oxlint.js", CWD)
      ).toBe("C:\\project")
    })

    it("take the working directory for an entry outside node_modules", () => {
      expect(getProjectDirectory("/adamantite/src/oxlint.ts", CWD)).toBe(CWD)
    })
  })

  describe("OXLINT_COMMAND", () => {
    it("start the entry beside the CLI module with Node.js, named oxlint", () => {
      expect(OXLINT_COMMAND).toStrictEqual({
        args: [expect.stringMatching(/[/\\]oxlint\.js$/u)],
        command: "node",
        name: "oxlint",
      })
    })
  })
})

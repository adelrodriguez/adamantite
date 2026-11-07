import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.optional(Schema.String) })),
})
const decodeOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

describe("architecture preset", () => {
  it.each([
    { codes: [], name: "alone", presets: ["architecture"], status: 0 },
    {
      codes: ["eslint(no-console)"],
      name: "with strict",
      presets: ["architecture", "strict"],
      status: 1,
    },
  ])("load $name without enabling architecture rules", ({ codes, presets, status }) => {
    const directory = mkdtempSync(join(tmpdir(), "adamantite-architecture-"))

    try {
      writeFileSync(join(directory, "package.json"), '{"type":"module"}')
      writeFileSync(join(directory, "example.ts"), 'console.log("fixture")\n')
      writeFileSync(
        join(directory, "oxlint.config.ts"),
        [
          ...presets.map(
            (preset) =>
              `import ${preset} from ${JSON.stringify(join(REPO_ROOT, `presets/lint/${preset}.ts`))}`
          ),
          `export default { extends: [${presets.join(", ")}] }`,
          "",
        ].join("\n")
      )
      const result = spawnSync(
        join(REPO_ROOT, "node_modules/.bin/oxlint"),
        ["-c", "oxlint.config.ts", "-f", "json", "example.ts"],
        { cwd: directory, encoding: "utf8" }
      )

      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe("")
      expect(
        decodeOutput(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
      ).toStrictEqual(codes)
      expect(result.status).toBe(status)
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})

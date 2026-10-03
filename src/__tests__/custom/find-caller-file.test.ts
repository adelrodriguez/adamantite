import { describe, expect, test } from "@effect/vitest"
import { findCallerFile } from "#presets/lint/custom.ts"

const OWN_FILE = "/project/node_modules/adamantite/dist/presets/lint/custom.js"

function callFromOwnFile() {
  return new Error("custom()").stack ?? ""
}

describe("findCallerFile", () => {
  test("find the config file in a Node.js stack, without Oxlint's cache query", () => {
    const stack = [
      "Error: custom()",
      "    at resolveRulesDirectory (file:///project/node_modules/adamantite/dist/presets/lint/custom.js:90:20)",
      "    at custom (file:///project/node_modules/adamantite/dist/presets/lint/custom.js:160:15)",
      "    at file:///project/oxlint.config.ts?cache=1:2:19",
      "    at ModuleJob.run (node:internal/modules/esm/module_job:569:25)",
      "    at async node:internal/modules/esm/loader:650:26",
    ].join("\n")

    expect(findCallerFile(stack, OWN_FILE)).toBe("/project/oxlint.config.ts")
  })

  test("find the config file in a Bun stack", () => {
    const stack = [
      "Error: custom()",
      "    at resolveRulesDirectory (/project/node_modules/adamantite/dist/presets/lint/custom.js:90:20)",
      "    at custom (/project/node_modules/adamantite/dist/presets/lint/custom.js:160:15)",
      "    at /project/oxlint.config.ts:2:19",
      "    at moduleEvaluation (native:1:11)",
    ].join("\n")

    expect(findCallerFile(stack, OWN_FILE)).toBe("/project/oxlint.config.ts")
  })

  test("find a named caller frame, such as a shared tooling config", () => {
    const stack = [
      "Error: custom()",
      "    at custom (/project/node_modules/adamantite/dist/presets/lint/custom.js:160:15)",
      "    at makeLintConfig (file:///project/tooling/lint/index.ts:4:10)",
    ].join("\n")

    expect(findCallerFile(stack, OWN_FILE)).toBe("/project/tooling/lint/index.ts")
  })

  test("find the caller in the stack of the current runtime", () => {
    expect(findCallerFile(callFromOwnFile(), import.meta.filename)).not.toBe(import.meta.filename)
    expect(findCallerFile(callFromOwnFile(), "/elsewhere.ts")).toBe(import.meta.filename)
  })

  test("return undefined when no frame names another file", () => {
    const stack = [
      "Error: custom()",
      "    at custom (/project/node_modules/adamantite/dist/presets/lint/custom.js:160:15)",
      "    at moduleEvaluation (native:1:11)",
    ].join("\n")

    expect(findCallerFile(stack, OWN_FILE)).toBeUndefined()
  })
})

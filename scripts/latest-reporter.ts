/**
 * The Vitest reporter of `scripts/test-latest.ts`. The JSON reporter of Vitest keeps the message
 * and the stack of a failure, but not its diff, which names the fixture file and the rule of each
 * report. This reporter writes the state and the complete errors of each test and test module to
 * the file that `ADAMANTITE_LATEST_RESULTS` names.
 */
import { writeFileSync } from "node:fs"
import process from "node:process"
import type { Reporter, TestModule } from "vitest/node"

const RESULTS_VARIABLE = "ADAMANTITE_LATEST_RESULTS"

function readResultsPath(): string {
  const path = process.env[RESULTS_VARIABLE]

  if (path === undefined || path === "") {
    throw new Error(`Expected ${RESULTS_VARIABLE} to name the results file.`)
  }

  return path
}

interface ReportedError {
  readonly diff?: string
  readonly message: string
  readonly stack?: string
}

/**
 * The message, the diff, and the stack frames outside `node_modules` of an error.
 */
function toText(error: ReportedError): string {
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at ") && !line.includes("node_modules"))

  return [error.message, error.diff ?? "", frames.join("\n")]
    .filter((part) => part !== "")
    .join("\n\n")
}

function toModuleResult(testModule: TestModule) {
  return {
    errors: testModule.errors().map(toText),
    id: testModule.relativeModuleId,
    state: testModule.state(),
  }
}

function toTestResults(testModule: TestModule) {
  return Array.from(testModule.children.allTests(), (test) => {
    const result = test.result()

    return {
      errors: (result.errors ?? []).map(toText),
      id: `${testModule.relativeModuleId} > ${test.fullName}`,
      module: testModule.relativeModuleId,
      state: result.state,
    }
  })
}

export default class LatestReporter implements Reporter {
  // Read when Vitest creates the reporter, so a run without the variable fails before any test.
  readonly #path = readResultsPath()

  onTestRunEnd: Reporter["onTestRunEnd"] = (testModules) => {
    writeFileSync(
      this.#path,
      JSON.stringify({
        modules: testModules.map(toModuleResult),
        tests: testModules.flatMap(toTestResults),
      })
    )
  }
}

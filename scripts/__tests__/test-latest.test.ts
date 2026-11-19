import { describe, expect, it } from "@effect/vitest"
import { classify, listSkipped, parseTestRun } from "../test-latest.ts"

const PASSED = JSON.stringify({
  modules: [{ errors: [], id: "a.test.ts", state: "passed" }],
  tests: [
    { errors: [], id: "a.test.ts > runs", module: "a.test.ts", state: "passed" },
    { errors: [], id: "a.test.ts > skips", module: "a.test.ts", state: "skipped" },
  ],
})

const UNKNOWN_STATE = JSON.stringify({
  modules: [{ errors: [], id: "a.test.ts", state: "passed" }],
  tests: [{ errors: [], id: "a.test.ts > runs", module: "a.test.ts", state: "running" }],
})

describe("the results of a latest-versions run", () => {
  it("report a candidate state that the schema does not know as an unreadable process failure", () => {
    const classification = classify({
      baseline: parseTestRun("baseline.results.json", PASSED),
      baselinePassed: true,
      candidate: parseTestRun("candidate.results.json", UNKNOWN_STATE),
      candidatePassed: true,
      updated: true,
    })

    expect(classification.outcome).toBe("process-failure")
    expect(classification.failures).toHaveLength(1)
    expect(classification.failures[0]).toMatchObject({
      id: "candidate.results.json",
      status: "unreadable",
    })
    expect(classification.failures[0]?.diagnostic).toContain('["tests"][0]["state"]')
  })

  it("list no skipped test when one run is unreadable", () => {
    expect(
      listSkipped(
        parseTestRun("baseline.results.json", PASSED),
        parseTestRun("candidate.results.json", UNKNOWN_STATE)
      )
    ).toStrictEqual([])
  })

  it("list a test that both runs skip", () => {
    expect(
      listSkipped(
        parseTestRun("baseline.results.json", PASSED),
        parseTestRun("candidate.results.json", PASSED)
      )
    ).toStrictEqual(["a.test.ts > skips"])
  })
})

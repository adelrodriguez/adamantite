import { describe, expect, it } from "@effect/vitest"
import {
  Block,
  END_MARKER,
  MalformedBlock,
  NoBlock,
  START_MARKER,
  readBlock,
  replaceBlock,
} from "#lib/integrations/ci/github-block.ts"

const HEADER = ["name: adamantite", "on: push", "jobs:"]
const MANAGED_JOB = ["  verify:", "    runs-on: ubuntu-latest"]
const PROJECT_JOB = ["  e2e:", "    runs-on: ubuntu-latest"]

function lines(...parts: string[][]) {
  return parts.flat().join("\n")
}

function readValidBlock(content: string) {
  const block = readBlock(content)

  if (!(block instanceof Block)) {
    throw new TypeError(`Expected a managed block, got ${block._tag}.`)
  }

  return block
}

describe("readBlock", () => {
  it("read the jobs between the markers", () => {
    expect(
      readBlock(
        lines(HEADER, [`  ${START_MARKER}`], MANAGED_JOB, [`  ${END_MARKER}`], PROJECT_JOB, [""])
      )
    ).toStrictEqual(
      new Block({
        after: lines([`  ${END_MARKER}`], PROJECT_JOB, [""]),
        before: lines(HEADER, [`  ${START_MARKER}`]),
        body: lines(MANAGED_JOB),
      })
    )
  })

  it("find markers at any indentation and with CRLF line endings", () => {
    const content = lines([START_MARKER], MANAGED_JOB, [`    ${END_MARKER}`]).replaceAll(
      "\n",
      "\r\n"
    )

    // Each line keeps its carriage return, so replaceBlock gives the same text back.
    expect(readValidBlock(content).body).toBe(`${lines(MANAGED_JOB).replaceAll("\n", "\r\n")}\r`)
  })

  it("find no block in a workflow without markers", () => {
    expect(readBlock(lines(HEADER, MANAGED_JOB))).toStrictEqual(new NoBlock())
  })

  it("not take a marker inside other text as a marker", () => {
    expect(
      readBlock(lines(HEADER, [`  - run: echo "${START_MARKER}"`], MANAGED_JOB))
    ).toStrictEqual(new NoBlock())
  })

  it.each([
    {
      content: lines(HEADER, [`  ${START_MARKER}`], MANAGED_JOB),
      name: "a start marker without an end marker",
      reason: `It has \`${START_MARKER}\` without \`${END_MARKER}\` after it.`,
    },
    {
      content: lines(HEADER, MANAGED_JOB, [`  ${END_MARKER}`]),
      name: "an end marker without a start marker",
      reason: `It has \`${END_MARKER}\` without \`${START_MARKER}\` before it.`,
    },
    {
      content: lines(HEADER, [`  ${END_MARKER}`], MANAGED_JOB, [`  ${START_MARKER}`]),
      name: "an end marker before the start marker",
      reason: `It has \`${START_MARKER}\` without \`${END_MARKER}\` after it.`,
    },
    {
      content: lines(
        HEADER,
        [`  ${START_MARKER}`],
        MANAGED_JOB,
        [`  ${END_MARKER}`, `  ${START_MARKER}`],
        PROJECT_JOB,
        [`  ${END_MARKER}`]
      ),
      name: "two blocks",
      reason: `It has more than one \`${START_MARKER}\` or \`${END_MARKER}\` comment.`,
    },
  ])("report $name", ({ content, reason }) => {
    expect(readBlock(content)).toStrictEqual(new MalformedBlock({ reason }))
  })
})

describe("replaceBlock", () => {
  it("replace only the body and keep the rest of the workflow", () => {
    const block = readValidBlock(
      lines(HEADER, [`  ${START_MARKER}`], MANAGED_JOB, [`  ${END_MARKER}`], PROJECT_JOB, [""])
    )

    expect(replaceBlock(block, "  check:\n    runs-on: macos-latest")).toBe(
      lines(
        HEADER,
        [`  ${START_MARKER}`, "  check:", "    runs-on: macos-latest", `  ${END_MARKER}`],
        PROJECT_JOB,
        [""]
      )
    )
  })

  it("give the same workflow for the same body, also for an empty body", () => {
    expect.assertions(2)

    for (const content of [
      lines(HEADER, [`  ${START_MARKER}`], MANAGED_JOB, [`  ${END_MARKER}`, ""]),
      lines(HEADER, [`  ${START_MARKER}`, `  ${END_MARKER}`]),
    ]) {
      const block = readValidBlock(content)

      expect(replaceBlock(block, block.body)).toBe(content)
    }
  })
})

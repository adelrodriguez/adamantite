import * as Data from "effect/Data"

/**
 * The comments around the managed block of a GitHub Actions workflow. Adamantite owns the jobs
 * between them, and the project owns the rest of the workflow. The YAML parser drops comments, so
 * the block is found in the text.
 */
export const START_MARKER = "# ADAMANTITE:START"
export const END_MARKER = "# ADAMANTITE:END"

/**
 * A workflow with one managed block. `before` ends with the start marker line, `after` starts with
 * the end marker line, and the three parts joined by line breaks give the workflow again.
 */
export class Block extends Data.TaggedClass("Block")<{
  readonly after: string
  readonly before: string
  readonly body: string
}> {}

/**
 * A workflow without a managed block.
 */
export class NoBlock extends Data.TaggedClass("None") {}

/**
 * A workflow whose markers do not make one managed block.
 */
export class MalformedBlock extends Data.TaggedClass("Malformed")<{ readonly reason: string }> {}

function findMarkerLines(lines: readonly string[], marker: string) {
  return lines.flatMap((line, index) => (line.trim() === marker ? [index] : []))
}

export function readBlock(content: string): Block | MalformedBlock | NoBlock {
  const lines = content.split("\n")
  const starts = findMarkerLines(lines, START_MARKER)
  const ends = findMarkerLines(lines, END_MARKER)
  const [start] = starts
  const [end] = ends

  if (start === undefined && end === undefined) {
    return new NoBlock()
  }

  if (starts.length > 1 || ends.length > 1) {
    return new MalformedBlock({
      reason: `It has more than one \`${START_MARKER}\` or \`${END_MARKER}\` comment.`,
    })
  }

  if (end === undefined || (start !== undefined && end < start)) {
    return new MalformedBlock({
      reason: `It has \`${START_MARKER}\` without \`${END_MARKER}\` after it.`,
    })
  }

  if (start === undefined) {
    return new MalformedBlock({
      reason: `It has \`${END_MARKER}\` without \`${START_MARKER}\` before it.`,
    })
  }

  return new Block({
    after: lines.slice(end).join("\n"),
    before: lines.slice(0, start + 1).join("\n"),
    body: lines.slice(start + 1, end).join("\n"),
  })
}

function measureIndent(line: string) {
  return line.length - line.trimStart().length
}

// The line that starts the first job of a block body. Blank lines and comments start no job.
function findFirstJob(lines: readonly string[]) {
  return lines.find((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
}

/**
 * The workflow with `body` in place of the body of its managed block. The new jobs take the
 * indentation of the jobs that they replace, or of the start marker when the block has no job, so
 * they stay siblings of the project's jobs.
 */
export function replaceBlock(block: Block, body: string): string {
  const lines = body === "" ? [] : body.split("\n")
  const startMarker = block.before.slice(block.before.lastIndexOf("\n") + 1)
  const from = measureIndent(findFirstJob(lines) ?? "")
  const to = measureIndent(findFirstJob(block.body.split("\n")) ?? startMarker)

  const indented = lines.map((line) => {
    if (line.trim() === "") {
      return line
    }

    return to > from ? `${" ".repeat(to - from)}${line}` : line.slice(from - to)
  })

  return [block.before, ...indented, block.after].join("\n")
}

import * as Layer from "effect/Layer"

export function makeIssueService() {
  return { issues: ["first"] }
}

export const issueServiceLayer = Layer.empty

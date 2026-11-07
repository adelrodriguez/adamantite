import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"

export { RuleTester } from "oxlint/plugins-dev"
export type * from "oxlint/plugins-dev"

// Agents use RuleTester from stdin or a temporary file. Connect it to node:test so each case
// reports its result and a failure sets the exit code. Keep the test runner out of rule imports.
RuleTester.describe = (text, method) => {
  void describe(text, method)
}
RuleTester.it = (text, method) => {
  void it(text, method)
}
RuleTester.itOnly = (text, method) => {
  void it.only(text, method)
}

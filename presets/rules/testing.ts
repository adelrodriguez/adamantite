import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"

export { RuleTester } from "oxlint/plugins-dev"

// Without a global `describe` and `it`, RuleTester runs each case directly and throws at the first
// failure.
RuleTester.describe = (text, method) => {
  void describe(text, method)
}

RuleTester.it = (text, method) => {
  void it(text, method)
}

RuleTester.itOnly = (text, method) => {
  void it.only(text, method)
}

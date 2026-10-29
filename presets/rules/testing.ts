import { describe, it } from "node:test"
import { RuleTester } from "oxlint/plugins-dev"

export { RuleTester } from "oxlint/plugins-dev"

// The testing surface for custom rules. A rule test imports `RuleTester` from here, so it has one
// import, as a rule file has. `adamantite rule test` runs the tests with `node --test`, so this
// module connects `RuleTester` to `node:test`, and each case reports by name. The declarations
// export only `RuleTester`, so a type-aware lint run needs no `@types/node`.

// `node:test` returns a promise that settles when the suite or the test ends. It reports a failure
// itself, so the promise is not needed.
RuleTester.describe = (text, method) => {
  void describe(text, method)
}
RuleTester.it = (text, method) => {
  void it(text, method)
}
RuleTester.itOnly = (text, method) => {
  void it.only(text, method)
}

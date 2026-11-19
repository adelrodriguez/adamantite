import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-manual-effect-error-tag", plugin.rules["no-manual-effect-error-tag"], {
  invalid: [
    {
      code: 'Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
      errors: [{ messageId: "tag" }],
      name: "report a _tag comparison inside Effect.catch",
    },
    {
      code: 'Effect.catchAll(function (error) { return error.reason._tag === "Timeout" ? retry : fail; });',
      errors: [{ messageId: "reason" }],
      name: "report a reason tag comparison inside Effect.catchAll",
    },
    {
      code: 'Effect.catchAll(function (error) { return error[`reason`][`_tag`] === "Timeout" ? retry : fail; });',
      errors: [{ messageId: "reason" }],
      name: "report a reason tag comparison through template literal keys",
    },
    {
      code: 'Effect[`catchAll`](function (error) { return error[`_tag`] === "Timeout" ? retry : fail; });',
      errors: [{ messageId: "tag" }],
      name: "report a _tag comparison inside a handler called through a template literal key",
    },
    {
      code: 'Effect.catchIf(predicate, (error) => { switch (error._tag) { case "NotFound": return recover; } });',
      errors: [{ messageId: "tag" }],
      name: "report a switch on _tag inside Effect.catchIf",
    },
  ],
  valid: [
    {
      code: 'error._tag === "NotFound";',
      name: "accept a _tag comparison outside an Effect error handler",
    },
    { code: 'Effect.catchTag("NotFound", recover);', name: "accept Effect.catchTag" },
    {
      code: 'Effect.catchTag("Wrapper", (error) => error.reason._tag === "Timeout" ? retry : fail);',
      name: "accept a reason tag comparison inside Effect.catchTag",
    },
  ],
})

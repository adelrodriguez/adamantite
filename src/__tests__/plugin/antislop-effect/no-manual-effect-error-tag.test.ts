import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

new RuleTester().run("no-manual-effect-error-tag", plugin.rules["no-manual-effect-error-tag"], {
  valid: [
    'error._tag === "NotFound";',
    'Effect.catchTag("NotFound", recover);',
    'Effect.catchTag("Wrapper", (error) => error.reason._tag === "Timeout" ? retry : fail);',
  ],
  invalid: [
    {
      code: 'Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
      errors: [{ messageId: "tag" }],
    },
    {
      code: 'Effect.catchAll(function (error) { return error.reason._tag === "Timeout" ? retry : fail; });',
      errors: [{ messageId: "reason" }],
    },
    {
      code: 'Effect.catchIf(predicate, (error) => { switch (error._tag) { case "NotFound": return recover; } });',
      errors: [{ messageId: "tag" }],
    },
  ],
})

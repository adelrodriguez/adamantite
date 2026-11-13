import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-manual-tag-comparison", plugin.rules["no-manual-tag-comparison"], {
  invalid: [
    {
      code: 'value._tag === "Ready";',
      errors: [{ messageId: "manualComparison" }],
    },
    {
      code: '"Ready" !== value["_tag"];',
      errors: [{ messageId: "manualComparison" }],
    },
    {
      code: 'switch (value._tag) { case "Ready": handleReady(value); }',
      errors: [{ messageId: "manualSwitch" }],
    },
  ],
  valid: [
    'Predicate.isTagged("Ready")(value);',
    'Match.value(value).pipe(Match.tag("Ready", handleReady));',
    'if (value.status === "Ready") handleReady(value);',
    'Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
  ],
})

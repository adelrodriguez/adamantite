import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-manual-tag-comparison", plugin.rules["no-manual-tag-comparison"], {
  invalid: [
    {
      code: '"Ready" === value[`_tag`];',
      errors: [{ messageId: "manualComparison" }],
      name: "report a literal compared with a _tag read through a template literal key",
    },
    {
      code: 'value._tag === "Ready";',
      errors: [{ messageId: "manualComparison" }],
      name: "report a _tag compared with a literal",
    },
    {
      code: '"Ready" !== value["_tag"];',
      errors: [{ messageId: "manualComparison" }],
      name: "report a literal compared with a _tag read through a string key",
    },
    {
      code: 'switch (value._tag) { case "Ready": handleReady(value); }',
      errors: [{ messageId: "manualSwitch" }],
      name: "report a switch on _tag",
    },
  ],
  valid: [
    { code: 'Predicate.isTagged("Ready")(value);', name: "accept Predicate.isTagged" },
    { code: 'Match.value(value).pipe(Match.tag("Ready", handleReady));', name: "accept Match.tag" },
    {
      code: 'if (value.status === "Ready") handleReady(value);',
      name: "accept a comparison of a field other than _tag",
    },
    {
      code: 'Effect.catch((error) => error._tag === "NotFound" ? recover : fail);',
      name: "accept a _tag comparison inside an Effect error handler, which no-manual-effect-error-tag reports",
    },
  ],
})

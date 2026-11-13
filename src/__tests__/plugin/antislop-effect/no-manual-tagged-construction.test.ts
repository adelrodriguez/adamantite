import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-manual-tagged-construction", plugin.rules["no-manual-tagged-construction"], {
  invalid: [
    {
      code: 'const value = { [`_tag`]: "Ready" };',
      errors: [{ messageId: "manualConstruction" }],
    },
    {
      code: 'const value = { _tag: "Ready", payload };',
      errors: [{ messageId: "manualConstruction" }],
    },
    {
      code: 'const value = { ["_tag"]: "Ready" };',
      errors: [{ messageId: "manualConstruction" }],
    },
    {
      code: 'Effect.fail({ _tag: "NotFound", path });',
      errors: [{ messageId: "manualConstruction" }],
    },
  ],
  valid: [
    'Match.when({ _tag: "Ready" }, handleReady);',
    'Match.not({ "_tag": "Pending" });',
    "Ready.make({ value });",
    "new NotFound({ id });",
    "({ _tag: tag, value });",
    'PlatformError.systemError({ _tag: "NotFound", module: "FileSystem", method: "readFile" });',
    'new PlatformError.SystemError({ _tag: "NotFound", module: "FileSystem", method: "readFile" });',
    'new HeaderParseErrorReason({ _tag: "InvalidHttpDate", input });',
  ],
})

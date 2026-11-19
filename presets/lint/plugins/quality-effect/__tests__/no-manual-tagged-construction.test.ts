import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("no-manual-tagged-construction", plugin.rules["no-manual-tagged-construction"], {
  invalid: [
    {
      code: 'const value = { [`_tag`]: "Ready" };',
      errors: [{ messageId: "manualConstruction" }],
      name: "report a literal _tag under a template literal key",
    },
    {
      code: 'const value = { _tag: "Ready", payload };',
      errors: [{ messageId: "manualConstruction" }],
      name: "report a literal _tag beside other fields",
    },
    {
      code: 'const value = { ["_tag"]: "Ready" };',
      errors: [{ messageId: "manualConstruction" }],
      name: "report a literal _tag under a computed string key",
    },
    {
      code: 'Effect.fail({ _tag: "NotFound", path });',
      errors: [{ messageId: "manualConstruction" }],
      name: "report a tagged object passed to Effect.fail",
    },
  ],
  valid: [
    {
      code: 'Match.when({ _tag: "Ready" }, handleReady);',
      name: "accept a _tag pattern in Match.when",
    },
    {
      code: 'Match.not({ "_tag": "Pending" });',
      name: "accept a quoted _tag pattern in Match.not",
    },
    {
      code: 'Match[`when`]({ _tag: "Ready" }, handleReady);',
      name: "accept a _tag pattern in Match.when called through a template literal key",
    },
    { code: "Ready.make({ value });", name: "accept a make call on a tagged class" },
    { code: "new NotFound({ id });", name: "accept a new tagged error" },
    { code: "({ _tag: tag, value });", name: "accept an object whose _tag is not a literal" },
    {
      code: 'PlatformError.systemError({ _tag: "NotFound", module: "FileSystem", method: "readFile" });',
      name: "accept the _tag of a PlatformError.systemError call",
    },
    {
      code: 'PlatformError[`systemError`]({ [`_tag`]: "NotFound", module: "FileSystem", method: "readFile" });',
      name: "accept the _tag of a PlatformError.systemError call through template literal keys",
    },
    {
      code: 'new PlatformError.SystemError({ _tag: "NotFound", module: "FileSystem", method: "readFile" });',
      name: "accept the _tag of a new PlatformError.SystemError",
    },
    {
      code: 'new HeaderParseErrorReason({ _tag: "InvalidHttpDate", input });',
      name: "accept the _tag of a reason class constructor",
    },
  ],
})

import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

const MISSING_REASON = { messageId: "missingReason" }

tester.run("require-suppression-reason", plugin.rules["require-suppression-reason"], {
  invalid: [
    {
      code: "// oxlint-disable-next-line no-console\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, column: 0, endColumn: 38, line: 1 }],
      name: "report a next-line directive without a reason",
    },
    {
      code: "// eslint-disable-next-line no-console\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report an eslint directive without a reason",
    },
    {
      code: "console.log(1) // oxlint-disable-line no-console",
      errors: [{ ...MISSING_REASON, column: 15, line: 1 }],
      name: "report a same-line directive without a reason",
    },
    {
      code: "/* oxlint-disable no-console */\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report a block directive without a reason",
    },
    {
      code: "/* eslint-disable typescript/no-explicit-any, typescript/no-unsafe-return */",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report a block directive for several rules without a reason",
    },
    {
      // A single dash is part of the rule list, not a reason.
      code: "// oxlint-disable-next-line no-console - the CLI prints\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report a single dash before the reason",
    },
    {
      code: "// oxlint-disable-next-line no-console --\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report two dashes without a reason",
    },
    {
      code: "// oxlint-disable-next-line no-console --   \nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report two dashes followed by spaces only",
    },
    {
      code: "// oxlint-disable-next-line no-console --reason\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
      name: "report a reason without a space after the dashes",
    },
    {
      code: "const a = 1\n{/* oxlint-disable-next-line react/no-danger */}",
      errors: [{ ...MISSING_REASON, line: 2 }],
      name: "report a directive inside a JSX expression container",
    },
    {
      code: "// oxlint-disable-next-line no-console\nconsole.log(1)\n// oxlint-disable-next-line no-console -- prints the report\nconsole.log(2)\n/* eslint-disable no-alert */",
      errors: [
        { ...MISSING_REASON, line: 1 },
        { ...MISSING_REASON, line: 5 },
      ],
      name: "report each directive without a reason among several",
    },
  ],
  valid: [
    {
      code: "// oxlint-disable-next-line no-console -- the CLI writes its report to stdout\nconsole.log(1)",
      name: "accept a next-line directive with a reason",
    },
    {
      code: "// eslint-disable-next-line no-console -- the CLI writes its report to stdout\nconsole.log(1)",
      name: "accept an eslint directive with a reason",
    },
    {
      code: "console.log(1) // oxlint-disable-line no-console -- prints the report",
      name: "accept a same-line directive with a reason",
    },
    {
      code: "/* oxlint-disable no-console -- this script prints its progress */\nconsole.log(1)",
      name: "accept a block directive with a reason",
    },
    {
      code: "// oxlint-disable-next-line no-console --- the CLI writes its report to stdout\nconsole.log(1)",
      name: "accept a reason after three dashes",
    },
    {
      code: "/* oxlint-disable no-console -- prints progress */\nconsole.log(1)\n/* oxlint-enable no-console */",
      name: "accept an enable directive without a reason",
    },
    {
      code: "// Never add oxlint-disable-next-line here.\nconst a = 1",
      name: "accept a comment that mentions a directive in prose",
    },
    {
      code: "// oxlint-disabled is not a directive\nconst a = 1",
      name: "accept a word that only starts like a directive",
    },
    {
      code: "/** @ts-expect-error - handled by typescript/ban-ts-comment */\nconst a = 1",
      name: "accept a ts-expect-error comment",
    },
  ],
})

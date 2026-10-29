import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"

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
    },
    {
      code: "// eslint-disable-next-line no-console\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "console.log(1) // oxlint-disable-line no-console",
      errors: [{ ...MISSING_REASON, column: 15, line: 1 }],
    },
    {
      code: "/* oxlint-disable no-console */\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "/* eslint-disable typescript/no-explicit-any, typescript/no-unsafe-return */",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      // A single dash is part of the rule list, not a reason.
      code: "// oxlint-disable-next-line no-console - the CLI prints\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "// oxlint-disable-next-line no-console --\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "// oxlint-disable-next-line no-console --   \nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "// oxlint-disable-next-line no-console --reason\nconsole.log(1)",
      errors: [{ ...MISSING_REASON, line: 1 }],
    },
    {
      code: "const a = 1\n{/* oxlint-disable-next-line react/no-danger */}",
      errors: [{ ...MISSING_REASON, line: 2 }],
    },
    {
      code: "// oxlint-disable-next-line no-console\nconsole.log(1)\n// oxlint-disable-next-line no-console -- prints the report\nconsole.log(2)\n/* eslint-disable no-alert */",
      errors: [
        { ...MISSING_REASON, line: 1 },
        { ...MISSING_REASON, line: 5 },
      ],
    },
  ],
  valid: [
    "// oxlint-disable-next-line no-console -- the CLI writes its report to stdout\nconsole.log(1)",
    "// eslint-disable-next-line no-console -- the CLI writes its report to stdout\nconsole.log(1)",
    "console.log(1) // oxlint-disable-line no-console -- prints the report",
    "/* oxlint-disable no-console -- this script prints its progress */\nconsole.log(1)",
    "// oxlint-disable-next-line no-console --- the CLI writes its report to stdout\nconsole.log(1)",
    // Turning rules back on needs no reason.
    "/* oxlint-disable no-console -- prints progress */\nconsole.log(1)\n/* oxlint-enable no-console */",
    // A comment that only mentions a directive does not turn off rules.
    "// Never add oxlint-disable-next-line here.\nconst a = 1",
    "// oxlint-disabled is not a directive\nconst a = 1",
    "/** @ts-expect-error - handled by typescript/ban-ts-comment */\nconst a = 1",
  ],
})

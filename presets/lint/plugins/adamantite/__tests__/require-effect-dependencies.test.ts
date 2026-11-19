import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

tester.run("require-effect-dependencies", plugin.rules["require-effect-dependencies"], {
  invalid: [
    {
      code: 'import { useEffect } from "react"\nexport function useTitle(title: string) {\n  useEffect(() => {\n    document.title = title\n  })\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
    },
    {
      code: 'import { useLayoutEffect as useMeasure } from "react"\nexport function useSize() {\n  useMeasure(() => {})\n}',
      errors: [{ column: 2, data: { hook: "useLayoutEffect" }, line: 3, messageId: "missing" }],
    },
    {
      code: 'import { useInsertionEffect } from "react"\nexport function useStyles() {\n  useInsertionEffect(() => {}, undefined)\n}',
      errors: [{ column: 2, data: { hook: "useInsertionEffect" }, line: 3, messageId: "missing" }],
    },
    {
      // React stores missing dependencies as `null`, so a JavaScript file that passes `null` runs the
      // effect after every render too.
      code: 'import { useEffect } from "react"\nexport function useTitle() {\n  useEffect(() => {}, null)\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
      languageOptions: { parserOptions: { lang: "jsx" } },
    },
    {
      code: 'import React from "react"\nexport function useTitle() {\n  React.useEffect(() => {})\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
    },
    {
      code: 'import * as React from "react"\nexport function useTitle() {\n  React["useEffect"](() => {})\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
    },
  ],
  valid: [
    'import { useEffect } from "react"\nexport function useTitle(title: string) {\n  useEffect(() => {\n    document.title = title\n  }, [title])\n}',
    'import { useLayoutEffect } from "react"\nexport function useMount() {\n  useLayoutEffect(() => {}, [])\n}',
    'import { useEffect } from "react"\nexport function useForward(args: Parameters<typeof useEffect>) {\n  useEffect(...args)\n}',
    "function useEffect(run: () => void) {\n  run()\n}\nexport function useOnce() {\n  useEffect(() => {})\n}",
  ],
})

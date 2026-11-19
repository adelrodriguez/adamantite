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
      name: "report useEffect without a dependency array",
    },
    {
      code: 'import { useLayoutEffect as useMeasure } from "react"\nexport function useSize() {\n  useMeasure(() => {})\n}',
      errors: [{ column: 2, data: { hook: "useLayoutEffect" }, line: 3, messageId: "missing" }],
      name: "report a renamed useLayoutEffect without a dependency array",
    },
    {
      code: 'import { useInsertionEffect } from "react"\nexport function useStyles() {\n  useInsertionEffect(() => {}, undefined)\n}',
      errors: [{ column: 2, data: { hook: "useInsertionEffect" }, line: 3, messageId: "missing" }],
      name: "report useInsertionEffect with undefined dependencies",
    },
    {
      // React stores missing dependencies as `null`, so a JavaScript file that passes `null` runs the
      // effect after every render too.
      code: 'import { useEffect } from "react"\nexport function useTitle() {\n  useEffect(() => {}, null)\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
      languageOptions: { parserOptions: { lang: "jsx" } },
      name: "report useEffect with null dependencies in a JavaScript file",
    },
    {
      code: 'import React from "react"\nexport function useTitle() {\n  React.useEffect(() => {})\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
      name: "report React.useEffect from a default import",
    },
    {
      code: 'import * as React from "react"\nexport function useTitle() {\n  React["useEffect"](() => {})\n}',
      errors: [{ column: 2, data: { hook: "useEffect" }, line: 3, messageId: "missing" }],
      name: "report useEffect read through a string key of a namespace import",
    },
  ],
  valid: [
    {
      code: 'import { useEffect } from "react"\nexport function useTitle(title: string) {\n  useEffect(() => {\n    document.title = title\n  }, [title])\n}',
      name: "accept useEffect with a dependency array",
    },
    {
      code: 'import { useLayoutEffect } from "react"\nexport function useMount() {\n  useLayoutEffect(() => {}, [])\n}',
      name: "accept useLayoutEffect with an empty dependency array",
    },
    {
      code: 'import { useEffect } from "react"\nexport function useForward(args: Parameters<typeof useEffect>) {\n  useEffect(...args)\n}',
      name: "accept arguments that a caller passes through a spread",
    },
    {
      code: "function useEffect(run: () => void) {\n  run()\n}\nexport function useOnce() {\n  useEffect(() => {})\n}",
      name: "accept a local function named useEffect",
    },
  ],
})

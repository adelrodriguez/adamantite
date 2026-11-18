import type { Plugin, Rule } from "@oxlint/plugins"
import noFlakeMasking from "./rules/no-flake-masking.ts"

interface TestingPlugin extends Plugin {
  readonly rules: {
    readonly "no-flake-masking": Rule
  }
}

/**
 * The testing rules that the strict preset enables in test files. They started as a copy of
 * https://github.com/interfere-inc/landmines. Adamantite uses the `testing` namespace. See
 * license.md.
 */
const plugin: TestingPlugin = {
  meta: { name: "testing" },
  rules: {
    "no-flake-masking": noFlakeMasking,
  },
}

export default plugin

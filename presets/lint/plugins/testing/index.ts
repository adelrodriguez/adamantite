import type { Plugin, Rule } from "@oxlint/plugins"
import noDoubles from "./rules/no-doubles.ts"
import noFixedSleep from "./rules/no-fixed-sleep.ts"
import noFlakeMasking from "./rules/no-flake-masking.ts"

interface TestingPlugin extends Plugin {
  readonly rules: {
    readonly "no-doubles": Rule
    readonly "no-fixed-sleep": Rule
    readonly "no-flake-masking": Rule
  }
}

/**
 * The testing rules that the strict preset enables. They started as a copy of
 * https://github.com/interfere-inc/landmines. Adamantite uses the `testing` namespace. See
 * license.md.
 */
const plugin: TestingPlugin = {
  meta: { name: "testing" },
  rules: {
    "no-doubles": noDoubles,
    "no-fixed-sleep": noFixedSleep,
    "no-flake-masking": noFlakeMasking,
  },
}

export default plugin

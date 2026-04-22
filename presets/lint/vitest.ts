import type { OxlintConfig } from "oxlint"

export default {
  plugins: ["vitest"],
  rules: {
    "vitest/consistent-each-for": "error",
    "vitest/hoisted-apis-on-top": "error",
    "vitest/no-conditional-tests": "error",
    "vitest/no-import-node-test": "error",
    "vitest/no-importing-vitest-globals": "error",
    "vitest/no-unneeded-async-expect-function": "error",
    "vitest/prefer-called-exactly-once-with": "error",
    "vitest/prefer-called-once": "error",
    "vitest/prefer-called-times": "error",
    "vitest/prefer-describe-function-title": "error",
    "vitest/prefer-expect-type-of": "error",
    "vitest/prefer-import-in-mock": "error",
    "vitest/prefer-strict-boolean-matchers": "error",
    "vitest/prefer-to-be-object": "error",
    "vitest/require-awaited-expect-poll": "error",
    "vitest/require-local-test-context-for-concurrent-snapshots": "error",
    "vitest/require-mock-type-parameters": "error",
  },
} as const satisfies OxlintConfig

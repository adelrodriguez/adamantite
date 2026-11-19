import type { OxlintOverride } from "oxlint"

export const PROCESS_RUN_TESTS = [
  "presets/__tests__/**/*.test.ts",
  "src/__tests__/macro-cache.test.ts",
  "src/oxlint/__tests__/index.test.ts",
  "src/commands/__tests__/rule.test.ts",
  "src/lib/hardening/__tests__/overrides.test.ts",
  "src/lib/hardening/__tests__/suppressions.test.ts",
  "src/lib/hardening/__tests__/trial.test.ts",
  "src/lib/integrations/oxlint/__tests__/index.test.ts",
  "src/lib/project/__tests__/config-loader.test.ts",
  "src/lib/project/custom-rules/__tests__/stub.test.ts",
  "src/lib/setup/__tests__/index.test.ts",
  "src/lib/bridge/__tests__/index.test.ts",
]

const IN_MEMORY =
  "Keep the files of a unit test in memory: provide the layer of `createFileSystemTestContext` from `#__tests__/filesystem.ts` with `Path.layer`. A test that needs the host filesystem starts a real process, and its file belongs in `PROCESS_RUN_TESTS` in `config/tests.ts`."

// A unit test keeps its files in memory, so it gives the same result on each machine and beside
// each other test. Every file in a `__tests__` folder is a unit test or its helper, except the
// process-run tests, the helpers beside the preset tests, and the benchmarks, which run only in
// the `presets` Vitest project. A unit test gets no host layer, and no `node:fs` function except
// the ones that read the repository, so it creates no temporary folder and writes no file.
// `unicorn/prefer-node-protocol` reports the same modules without `node:`, and
// `eslint/no-restricted-properties` in `oxlint.config.ts` reports a `process.chdir()` call in every
// file.
export const inMemoryTests = {
  excludeFiles: [...PROCESS_RUN_TESTS, "presets/__tests__/**", "**/*.bench.ts"],
  files: ["**/__tests__/**"],
  rules: {
    "eslint/no-restricted-imports": [
      "error",
      {
        paths: [
          { message: IN_MEMORY, name: "@effect/platform-node" },
          { message: IN_MEMORY, name: "@effect/platform-node/NodeFileSystem" },
          { message: IN_MEMORY, name: "@effect/platform-node/NodeServices" },
          {
            allowImportNames: ["existsSync", "globSync", "readFileSync", "readdirSync"],
            message: IN_MEMORY,
            name: "node:fs",
          },
          { message: IN_MEMORY, name: "node:fs/promises" },
          { importNames: ["tmpdir"], message: IN_MEMORY, name: "node:os" },
        ],
      },
    ],
  },
} satisfies OxlintOverride

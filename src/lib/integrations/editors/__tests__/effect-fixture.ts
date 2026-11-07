import process from "node:process"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"

const PLATFORM = `${process.platform}-${process.arch}`
const PLATFORM_DIRECTORY = `node_modules/@effect/tsgo-${PLATFORM}`
export const EFFECT_COMPILER = `${PLATFORM_DIRECTORY}/lib/${process.platform === "win32" ? "tsc.exe" : "tsc"}`
export const EFFECT_SDK = "node_modules/.cache/adamantite/effect"

export function effectEditorFiles() {
  return {
    [EFFECT_COMPILER]: "native compiler",
    [`${PLATFORM_DIRECTORY}/lib/lib.d.ts`]: '/// <reference lib="es5" />',
    [`${PLATFORM_DIRECTORY}/lib/lib.es5.d.ts`]: "interface String {}",
    [`${PLATFORM_DIRECTORY}/lib/upstream.json`]: JSON.stringify({
      components: { typescript: { "7.0.2": { gitHead: "typescript-commit" } } },
      schemaVersion: 5,
      tags: { typescript: { latest: "7.0.2" } },
    }),
    [`${PLATFORM_DIRECTORY}/package.json`]: JSON.stringify({ version: "0.67.3" }),
    "node_modules/@effect/tsgo/oxlint-schema.json": JSON.stringify({
      definitions: {
        DummyRuleMap: {
          properties: {
            "effecttsgo/floating-effect": {},
            "effecttsgo/global-json-in-effect": {},
            "effecttsgo/missing-star-in-yield-effect-gen": {},
          },
        },
      },
    }),
    "node_modules/@effect/tsgo/package.json": JSON.stringify({ version: "0.67.3" }),
    "node_modules/typescript/package.json": JSON.stringify({
      gitHead: "typescript-commit",
      version: "7.0.2",
    }),
    "package.json": JSON.stringify({ devDependencies: { "@effect/tsgo": "0.67.3" } }),
  }
}

export function effectEditorResolver(root: string, installed: boolean) {
  return makeModuleResolverLayer(
    root,
    installed
      ? {
          [`@effect/tsgo-${PLATFORM}/package.json`]: `${PLATFORM_DIRECTORY}/package.json`,
          "@effect/tsgo/package.json": "node_modules/@effect/tsgo/package.json",
          "typescript/package.json": "node_modules/typescript/package.json",
        }
      : {}
  )
}

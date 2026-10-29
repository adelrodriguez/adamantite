import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { ResolverFactory } from "oxc-resolver"

export class ModuleResolver extends Context.Service<
  ModuleResolver,
  {
    /**
     * The file that Node.js loads for `specifier` when `from` imports it, as Oxlint imports a
     * config. None when the specifier does not resolve, such as a workspace package before an
     * install.
     */
    readonly resolve: (from: string, specifier: string) => Effect.Effect<Option.Option<string>>
  }
>()("ModuleResolver") {
  static readonly layer = Layer.sync(this, () => {
    // Node.js conditions and no `tsconfig.json` `paths`, because Oxlint loads configs through
    // Node.js. A TypeScript source can import a sibling with the `.js` extension of its build
    // output.
    const resolver = new ResolverFactory({
      conditionNames: ["node", "import", "default"],
      extensionAlias: {
        ".cjs": [".cts", ".cjs"],
        ".js": [".ts", ".js"],
        ".mjs": [".mts", ".mjs"],
      },
      extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
    })

    return {
      resolve: (from, specifier) =>
        Effect.sync(() => Option.fromUndefinedOr(resolver.resolveFileSync(from, specifier).path)),
    }
  })
}

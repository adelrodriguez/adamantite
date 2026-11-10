import type packageJson from "../../../package.json"

/**
 * A subpath in the `exports` map of this package, such as `./lint/react`. The type-only import of
 * `package.json` keeps the manifest out of the bundle.
 */
type Subpath = Extract<keyof (typeof packageJson)["exports"], `./${string}`>

/**
 * The import that a target project writes for a public subpath, such as `adamantite/lint/react`
 * for `./lint/react`. The type checker rejects a subpath that the package does not export.
 */
export function publicImport(subpath: Subpath) {
  return `adamantite${subpath.slice(1)}`
}

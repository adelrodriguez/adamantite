import type packageJson from "../../../package.json"

type Subpath = Extract<keyof (typeof packageJson)["exports"], `./${string}`>

export function publicImport(subpath: Subpath) {
  return `adamantite${subpath.slice(1)}`
}

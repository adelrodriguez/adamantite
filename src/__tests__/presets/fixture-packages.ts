import { spawnSync } from "node:child_process"
import { mkdirSync, readdirSync, symlinkSync } from "node:fs"
import { join } from "node:path"

const REPO_ROOT = join(import.meta.dirname, "../../..")

/**
 * The folder of the fixture packages: the packages that the fixtures import, such as React and
 * TanStack Query, so that a type-aware run gets their real types. The folder has its own
 * `package.json` and lockfile outside the pnpm workspace, so the root manifest lists only what
 * Adamantite builds, publishes, and tests itself against.
 */
export const FIXTURE_PACKAGES_DIR = join(import.meta.dirname, "fixture-packages")

/**
 * Install the fixture packages from their lockfile. The Vitest `globalSetup` of the `presets`
 * project runs it, so `pnpm install` and then `pnpm run test` is enough after a fresh clone. When
 * the install is current, pnpm changes nothing.
 */
export default function installFixturePackages(): void {
  const result = spawnSync(
    "pnpm",
    ["install", "--dir", FIXTURE_PACKAGES_DIR, "--ignore-workspace", "--frozen-lockfile"],
    { encoding: "utf8" }
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Could not install the fixture packages.\n${result.stdout}${result.stderr}`)
  }
}

/**
 * Link each package of `source` into `target`, and each package of a scope, such as `@types`, one
 * at a time, so that two sources can add packages to one scope. The package manager's own entries,
 * such as `.pnpm` and `.bin`, stay out.
 */
function linkPackages(source: string, target: string): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue
    }

    if (entry.name.startsWith("@") && entry.isDirectory()) {
      mkdirSync(join(target, entry.name), { recursive: true })
      linkPackages(join(source, entry.name), join(target, entry.name))
    } else {
      symlinkSync(join(source, entry.name), join(target, entry.name))
    }
  }
}

/**
 * Create the `node_modules` folder of a fixture project with the packages of the repository and the
 * fixture packages. A package in both fails with `EEXIST`, and `fixture-packages.test.ts` names it.
 * The `.bin` folder comes from the repository, because Oxlint looks for `tsrs-lint` there.
 */
export function linkFixturePackages(nodeModules: string): void {
  const repositoryPackages = join(REPO_ROOT, "node_modules")

  mkdirSync(nodeModules)
  symlinkSync(join(repositoryPackages, ".bin"), join(nodeModules, ".bin"))
  linkPackages(repositoryPackages, nodeModules)
  linkPackages(join(FIXTURE_PACKAGES_DIR, "node_modules"), nodeModules)
}

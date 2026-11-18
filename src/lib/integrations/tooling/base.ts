import type { Finding, PackageAction, ToolingPackage } from "#lib/integrations/base.ts"
import type * as Project from "#lib/project/index.ts"
import { matchDeclaredVersion, parseDependencySpecifier } from "#lib/project/package-json.ts"

export type RequiredConfigInspection =
  | { readonly kind: "configured" }
  | {
      /**
       * The repair for `reason`.
       */
      readonly goal: string
      readonly kind: "invalid"
      readonly reason: string
    }

interface PackageAssessment {
  readonly findings: readonly Finding[]
  readonly packageActions: readonly PackageAction[]
  readonly warnings: readonly string[]
}

const CURRENT: PackageAssessment = { findings: [], packageActions: [], warnings: [] }

/**
 * Compare the version that the project declares for a managed package with the version that
 * Adamantite requires. `adamantite update` installs a missing or outdated package from the package
 * action, and Doctor reports the finding, which says to run `update`. A version from a pnpm catalog
 * needs a change to the catalog, which `update` does not make, because `pnpm add` replaces the
 * `catalog:` specifier.
 */
export function assessPackage(
  { packageJson, workspace: { catalogs } }: Pick<Project.Snapshot, "packageJson" | "workspace">,
  pkg: ToolingPackage,
  purpose: string,
  integration: string
): PackageAssessment {
  const specifier = packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

  if (!specifier) {
    return {
      findings: [
        {
          currentState: `The required package \`${pkg.name}\` is not installed.`,
          goal: [`Run \`adamantite update\` so \`${pkg.name}@${pkg.version}\` is installed.`],
          id: `missing-${pkg.name}`,
          integration,
          title: `Missing ${pkg.name}`,
        },
      ],
      packageActions: [
        {
          description: `Install \`${pkg.name}@${pkg.version}\` for ${purpose}.`,
          package: pkg.name,
          targetVersion: pkg.version,
          type: "install_package",
        },
      ],
      warnings: [],
    }
  }

  function unreadable(declared: string): PackageAssessment {
    return {
      findings: [],
      packageActions: [],
      warnings: [
        `\`${pkg.name}\` is declared as \`${declared}\`, so Adamantite cannot check it against the required version \`${pkg.version}\`.`,
      ],
    }
  }

  function outdatedCatalog(catalog: string, entry: string): PackageAssessment {
    const catalogName = catalog === "default" ? "the `catalog`" : `the \`${catalog}\` catalog`

    return {
      findings: [
        {
          currentState: `${catalogName} of \`pnpm-workspace.yaml\` sets \`${pkg.name}\` to \`${entry}\`, but Adamantite requires \`${pkg.version}\`.`,
          goal: [
            `Set \`${pkg.name}\` to \`${pkg.version}\` in ${catalogName} of \`pnpm-workspace.yaml\`, then install the dependencies.`,
          ],
          id: `outdated-${pkg.name}`,
          integration,
          notes: [
            "Keep the `catalog:` specifier in `package.json`. `adamantite update` does not change catalogs.",
          ],
          title: `Outdated ${pkg.name}`,
        },
      ],
      packageActions: [],
      warnings: [],
    }
  }

  return matchDeclaredVersion(parseDependencySpecifier(specifier), {
    Catalog: ({ catalog }) => {
      const entry = catalogs[catalog]?.[pkg.name]

      if (entry === undefined) {
        return unreadable(specifier)
      }

      // A catalog entry is itself a specifier, but a catalog cannot refer to another catalog.
      return matchDeclaredVersion(parseDependencySpecifier(entry), {
        Catalog: () => unreadable(specifier),
        Unreadable: () => unreadable(specifier),
        Version: ({ version }) =>
          version === pkg.version ? CURRENT : outdatedCatalog(catalog, entry),
      })
    },
    Unreadable: () => unreadable(specifier),
    Version: ({ version }): PackageAssessment =>
      version === pkg.version
        ? CURRENT
        : {
            findings: [
              {
                currentState: `The installed \`${pkg.name}\` version is \`${specifier}\`, but Adamantite requires \`${pkg.version}\`.`,
                goal: [`Run \`adamantite update\` so \`${pkg.name}@${pkg.version}\` is installed.`],
                id: `outdated-${pkg.name}`,
                integration,
                title: `Outdated ${pkg.name}`,
              },
            ],
            packageActions: [
              {
                currentVersion: specifier,
                description: `Update \`${pkg.name}\` from \`${specifier}\` to \`${pkg.version}\`.`,
                package: pkg.name,
                targetVersion: pkg.version,
                type: "update_package",
              },
            ],
            warnings: [],
          },
  })
}

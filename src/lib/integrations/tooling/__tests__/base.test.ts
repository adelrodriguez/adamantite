import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Arbitrary from "effect/Arbitrary"
import * as Schema from "effect/Schema"
import type { Catalogs } from "#lib/project/monorepo.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"

function makeProject(packageJson: PackageJson, catalogs: Catalogs = {}) {
  return { packageJson, workspace: { catalogs, isMonorepo: false, packageDirectories: [] } }
}

describe("assessPackage", () => {
  const pkg = { name: "tool", version: "1.2.3" }

  const specifier = Arbitrary.schema(
    Schema.NullOr(
      Schema.Tuple([
        Schema.Literals(["", "workspace:"]),
        Schema.Literals(["", "^", "~"]),
        Schema.Literals(["1.2.3", "1.0.0", "2.4.6-beta.1"]),
      ])
    )
  ).pipe(
    Arbitrary.map((parts) => {
      if (parts === null) return null
      const [workspacePrefix, rangePrefix, version] = parts

      return { version, written: `${workspacePrefix}${rangePrefix}${version}` }
    })
  )

  it.prop(
    "classify any manifest into exactly one of match, install, or update",
    {
      field: Schema.Literals(["dependencies", "devDependencies"]),
      installed: specifier,
    },
    ({ field, installed }) => {
      const manifest = installed === null ? {} : { [field]: { tool: installed.written } }

      const actions = assessPackage(makeProject(manifest), pkg, "purpose", "tool").packageActions

      if (installed === null) {
        expect(actions).toStrictEqual([
          expect.objectContaining({ targetVersion: pkg.version, type: "install_package" }),
        ])
      } else if (installed.version === pkg.version) {
        expect(actions).toStrictEqual([])
      } else {
        expect(actions).toStrictEqual([
          expect.objectContaining({
            currentVersion: installed.written,
            targetVersion: pkg.version,
            type: "update_package",
          }),
        ])
      }
    },
    { arbitrary: { runs: 200 } }
  )

  it("accept a catalog entry at the required version", () => {
    expect(
      assessPackage(
        makeProject(
          { devDependencies: { tool: "catalog:" } },
          { default: { tool: "1.2.3" }, tools: { tool: "^1.2.3" } }
        ),
        pkg,
        "purpose",
        "tool"
      )
    ).toStrictEqual({ findings: [], packageActions: [], warnings: [] })
  })

  it("report an outdated catalog entry without a package action", () => {
    const result = assessPackage(
      makeProject({ devDependencies: { tool: "catalog:tools" } }, { tools: { tool: "1.0.0" } }),
      pkg,
      "purpose",
      "tool"
    )

    expect(result.packageActions).toStrictEqual([])
    expect(result.findings).toStrictEqual([
      expect.objectContaining({
        goal: [
          "Set `tool` to `1.2.3` in the `tools` catalog of `pnpm-workspace.yaml`, then install the dependencies.",
        ],
        id: "outdated-tool",
      }),
    ])
  })

  it.each([
    ["an alias", { tool: "npm:tool@1.2.3" }],
    ["a catalog without the package", { tool: "catalog:" }],
  ])("warn about %s instead of reporting an outdated version", (_name, devDependencies) => {
    expect(assessPackage(makeProject({ devDependencies }), pkg, "purpose", "tool")).toStrictEqual({
      findings: [],
      packageActions: [],
      warnings: [
        `\`tool\` is declared as \`${devDependencies.tool}\`, so Adamantite cannot check it against the required version \`1.2.3\`.`,
      ],
    })
  })
})

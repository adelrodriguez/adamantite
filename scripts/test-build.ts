import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Schema from "effect/Schema"
import packageJson from "../package.json" with { type: "json" }

const cliPath = join(import.meta.dirname, "..", "bin", "adamantite")

const output = execFileSync(process.execPath, [cliPath, "--version"], {
  encoding: "utf8",
})
const expectedVersion = `adamantite v${packageJson.version}`

if (!output.includes(expectedVersion)) {
  throw new Error(
    `Expected the built CLI to print ${JSON.stringify(expectedVersion)}, received ${JSON.stringify(output.trim())}`
  )
}

console.info(`Verified built CLI: ${expectedVersion}`)

const fixture = mkdtempSync(join(tmpdir(), "adamantite-cli-"))
const repo = join(import.meta.dirname, "..")

try {
  for (const command of ["format", "monorepo"]) {
    const result = spawnSync(process.execPath, [cliPath, command], {
      cwd: fixture,
      encoding: "utf8",
    })
    if (result.status !== 1 || !result.stderr.includes(`Unknown subcommand "${command}"`)) {
      throw new Error(
        `Expected ${command} to fail as an unknown command: ${result.stdout}${result.stderr}`
      )
    }
  }

  for (const script of ["format", "check:monorepo", "fix:monorepo"]) {
    const result = spawnSync(
      process.execPath,
      [cliPath, "init", "--non-interactive", "--script", script],
      { cwd: fixture, encoding: "utf8" }
    )
    if (result.status !== 1 || !result.stderr.includes("Invalid value for flag --script")) {
      throw new Error(`Expected init to reject ${script}: ${result.stdout}${result.stderr}`)
    }
  }

  mkdirSync(join(fixture, "node_modules"))
  for (const name of ["adamantite", "oxlint", "oxfmt", "tsrs", "oxlint-plugin-react-doctor"]) {
    symlinkSync(
      name === "adamantite" ? repo : join(repo, "node_modules", name),
      join(fixture, "node_modules", name),
      "junction"
    )
  }
  const retiredPreset = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", 'await import("adamantite/lint/react-doctor")'],
    { cwd: fixture, encoding: "utf8" }
  )
  if (retiredPreset.status !== 1 || !retiredPreset.stderr.includes("ERR_MODULE_NOT_FOUND")) {
    throw new Error(
      `Expected the retired preset import to fail: ${retiredPreset.stdout}${retiredPreset.stderr}`
    )
  }
  writeFileSync(
    join(fixture, "package.json"),
    JSON.stringify({
      devDependencies: {
        adamantite: packageJson.version,
        oxlint: packageJson.devDependencies.oxlint,
        "oxlint-plugin-react-doctor": packageJson.devDependencies["oxlint-plugin-react-doctor"],
      },
      name: "react-strict-build-fixture",
      scripts: { check: "adamantite check" },
      type: "module",
    })
  )
  const configPath = join(fixture, "oxlint.config.ts")
  const legacyConfig = [
    'import react from "adamantite/lint/react"',
    'import oldDoctor from "adamantite/lint/react-doctor"',
    "export default { extends: [react, oldDoctor], options: { respectEslintDisableDirectives: true, typeAware: true, typeCheck: true } }",
  ].join("\n")
  writeFileSync(configPath, legacyConfig)
  const doctor = spawnSync(process.execPath, [cliPath, "doctor"], {
    cwd: fixture,
    encoding: "utf8",
  })
  if (
    doctor.status !== 1
    || !doctor.stdout.includes("React Doctor rules now belong to react-strict")
  ) {
    throw new Error(
      `Expected Doctor to report the retired preset: ${doctor.stdout}${doctor.stderr}`
    )
  }
  if (readFileSync(configPath, "utf8") !== legacyConfig) {
    throw new Error("Doctor changed the legacy config instead of reporting its migration")
  }
  const repairedConfig = legacyConfig
    .replaceAll("oldDoctor", "reactStrict")
    .replace("adamantite/lint/react-doctor", "adamantite/lint/react-strict")
  writeFileSync(configPath, repairedConfig)
  const reassessed = spawnSync(process.execPath, [cliPath, "doctor"], {
    cwd: fixture,
    encoding: "utf8",
  })
  if (
    reassessed.error
    || reassessed.stdout.includes("React Doctor rules now belong to react-strict")
  ) {
    throw new Error(
      `Doctor still reports the repaired preset: ${reassessed.stdout}${reassessed.stderr}`
    )
  }
  mkdirSync(join(fixture, "src/hooks"), { recursive: true })
  writeFileSync(
    join(fixture, "src/Counter.tsx"),
    'import { useState } from "react"\nexport function Counter() { const [value, setValue] = useState(0); return <button type="button" onClick={() => setValue(value + 1)}>{value}</button> }\n'
  )
  writeFileSync(
    join(fixture, "src/hooks/useTicker.ts"),
    'import { useEffect } from "react"\nexport function useTicker() { useEffect(() => { setInterval(() => console.log("tick"), 1000) }, []) }\n'
  )
  writeFileSync(
    configPath,
    repairedConfig.replace(
      ", options: { respectEslintDisableDirectives: true, typeAware: true, typeCheck: true }",
      ""
    )
  )
  const lint = spawnSync(
    process.execPath,
    [join(repo, "src/oxlint.ts"), "-c", configPath, "-f", "json", "src"],
    { cwd: fixture, encoding: "utf8" }
  )
  const lintResult = Schema.decodeSync(
    Schema.fromJsonString(
      Schema.Struct({
        diagnostics: Schema.Array(Schema.Struct({ code: Schema.optional(Schema.String) })),
      })
    )
  )(lint.stdout)
  const codes = new Set(lintResult.diagnostics.map((entry) => entry.code))
  if (
    lint.status !== 1
    || !codes.has("adamantite(no-react-state-hooks)")
    || !codes.has("react-doctor(effect-needs-cleanup)")
  ) {
    throw new Error(
      `The built react-strict preset did not load both plugins: ${lint.stdout}${lint.stderr}`
    )
  }
  console.info("Verified built react-strict plugins and Doctor preset migration")
} finally {
  rmSync(fixture, { force: true, recursive: true })
}

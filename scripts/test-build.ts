import { execFileSync } from "node:child_process"
import packageJson from "../package.json" with { type: "json" }

const output = execFileSync(process.execPath, ["bin/adamantite", "--version"], {
  encoding: "utf8",
})
const expectedVersion = `adamantite v${packageJson.version}`

if (!output.includes(expectedVersion)) {
  throw new Error(
    `Expected the built CLI to print ${JSON.stringify(expectedVersion)}, received ${JSON.stringify(output.trim())}`
  )
}

console.log(`Verified built CLI: ${expectedVersion}`)

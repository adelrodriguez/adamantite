import { join } from "node:path"
import { describe } from "@effect/vitest"
import { describeModelFixtures } from "./model-fixtures.ts"

// Each model is a small project with its own `package.json` files and an `import-owners.json`
// config fragment that turns on `adamantite/import-owners`.
describe("import-owners rule fixtures", () => {
  describeModelFixtures({
    configFile: "import-owners.json",
    fixturesDir: join(import.meta.dirname, "fixtures/import-owners"),
    ruleCode: "adamantite(import-owners)",
  })
})

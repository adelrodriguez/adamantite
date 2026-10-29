import { join } from "node:path"
import { describe } from "@effect/vitest"
import { describeModelFixtures } from "./model-fixtures.ts"

// Each model is a small project with its own `package.json` files and a `layers.json` config
// fragment that turns on `adamantite/layers`.
describe("layers rule fixtures", () => {
  describeModelFixtures({
    configFile: "layers.json",
    fixturesDir: join(import.meta.dirname, "fixtures/layers"),
    ruleCode: "adamantite(layers)",
  })
})

import { join } from "node:path"
import { describe } from "@effect/vitest"
import { describeModelFixtures } from "./model-fixtures.ts"

// Each model is a small project with its own `GLOSSARY.md` and a `no-avoided-terms.json` config
// fragment that turns on `adamantite/no-avoided-terms`. The rule reads the glossary from the file
// system, so each model runs under Node.js and under Bun.
describe("no-avoided-terms rule fixtures", () => {
  describeModelFixtures({
    configFile: "no-avoided-terms.json",
    fixturesDir: join(import.meta.dirname, "fixtures/no-avoided-terms"),
    ruleCode: "adamantite(no-avoided-terms)",
    runtimes: ["node", "bun"],
  })
})

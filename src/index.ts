import { defineCommand, runMain } from "citty"
import check from "./commands/check"
import ci from "./commands/ci"
import fix from "./commands/fix"
import init from "./commands/init"
import monorepo from "./commands/monorepo"
import update from "./commands/update"
import version from "./version"

const main = defineCommand({
  meta: {
    name: "adamantite",
    description:
      "An opinionated set of presets for modern TypeScript applications",
    version,
  },
  subCommands: {
    check,
    ci,
    fix,
    init,
    monorepo,
    update,
  },
})

void runMain(main)

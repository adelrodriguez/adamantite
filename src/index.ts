import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import analyze from "#commands/analyze.ts"
import check from "#commands/check.ts"
import fix from "#commands/fix.ts"
import format from "#commands/format.ts"
import init from "#commands/init.ts"
import monorepo from "#commands/monorepo.ts"
import typecheck from "#commands/typecheck.ts"
import update from "#commands/update.ts"
import { getPackageVersion } from "#version.ts" with { type: "macro" }

const version = await getPackageVersion()

void yargs(hideBin(process.argv))
  .scriptName("adamantite")
  .version(version)
  .command(analyze)
  .command(check)
  .command(fix)
  .command(format)
  .command(init)
  .command(monorepo)
  .command(typecheck)
  .command(update)
  .demandCommand(1)
  .strict()
  .help()
  .parse()

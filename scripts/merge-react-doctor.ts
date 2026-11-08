// Reproduce the repeated preset-reference changes for #647.
// Run `node scripts/merge-react-doctor.ts` from the repository root.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "..")

for (const file of [
  "src/commands/__tests__/init.test.ts",
  "src/commands/init/options.ts",
  "src/commands/init/prompts.ts",
  "src/lib/integrations/tooling/oxlint/plugins/react-doctor.ts",
]) {
  const path = join(root, file)
  const content = readFileSync(path, "utf8")
  const updated = content
    .replaceAll('"react-doctor"', '"react-strict"')
    .replaceAll("`react-doctor`", "`react-strict`")
    .replaceAll("--preset react-doctor", "--preset react-strict")
    .replaceAll("react-doctor without the react preset", "react-strict without the react preset")
    .replaceAll(
      "when the react-doctor preset is selected",
      "when the react-strict preset is selected"
    )
    .replaceAll("when react-doctor is selected", "when react-strict is selected")
    .replaceAll(
      'import reactDoctor from "adamantite/lint/react-doctor"',
      'import reactStrict from "adamantite/lint/react-strict"'
    )
  if (updated !== content) writeFileSync(path, updated)
}

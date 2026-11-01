import { fileURLToPath } from "node:url"

/**
 * The entry that runs Oxlint with the project's toolchain. The build writes it beside the CLI
 * bundle, as `dist/oxlint.js`, so the CLI runs the entry of its own version.
 */
const OXLINT_ENTRY = fileURLToPath(new URL("oxlint.js", import.meta.url))

/**
 * The `CommandRunner` command for Oxlint. Arguments go after `args`.
 */
export const OXLINT_COMMAND = {
  args: [OXLINT_ENTRY],
  command: "node",
  name: "oxlint",
} as const

/**
 * The project that the entry runs Oxlint for: the folder above the first `node_modules` folder in
 * the path that started the entry. Editors start language servers without a working directory in
 * the project, so the path decides. The first `node_modules` also covers a package manager store
 * inside the project, such as `node_modules/.pnpm/`. The Adamantite repository starts the entry as
 * `src/oxlint.ts`, outside `node_modules`, so there the project is `cwd`.
 */
export function getProjectDirectory(entry: string, cwd: string): string {
  const indexes = [entry.indexOf("/node_modules/"), entry.indexOf("\\node_modules\\")].filter(
    (index) => index !== -1
  )

  return indexes.length === 0 ? cwd : entry.slice(0, Math.min(...indexes))
}

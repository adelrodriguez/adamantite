import type { ParseError } from "jsonc-parser"

/**
 * Available scripts that can be added to package.json during initialization.
 */
export type Script =
  | "check"
  | "fix"
  | "format"
  | "typecheck"
  | "check:monorepo"
  | "fix:monorepo"
  | "analyze"

declare module "faultier" {
  interface FaultRegistry {
    CLI_NOT_FOUND: { command: string }
    FAILED_TO_CREATE_DIRECTORY: { path?: string }
    FAILED_TO_INSTALL_DEPENDENCY: never
    FAILED_TO_INSTALL_EXTENSION: never
    FAILED_TO_MERGE_CONFIG: { path?: string }
    FAILED_TO_PARSE_FILE: { path?: string; errors?: ParseError[] }
    FAILED_TO_READ_FILE: { path?: string }
    FAILED_TO_RUN_COMMAND: { command?: string }
    FAILED_TO_WRITE_FILE: { path?: string }
    FILE_NOT_FOUND: { path?: string }
    INVALID_CONFIG_FORMAT: { path?: string }
    NO_PACKAGE_MANAGER: never
    MISSING_PACKAGE_VERSION: never
    OPERATION_CANCELLED: never
    UNKNOWN_SCRIPT: { script: string }
    VSCODE_CLI_NOT_FOUND: never
  }
}

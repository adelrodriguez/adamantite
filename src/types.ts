import type { ParseError } from "jsonc-parser"

declare module "faultier" {
  interface FaultRegistry {
    FAILED_TO_CREATE_DIRECTORY: { path?: string }
    FAILED_TO_INSTALL_DEPENDENCY: never
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
  }
}

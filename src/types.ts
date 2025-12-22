import type { ParseError } from "jsonc-parser"

interface CommonErrors {
  FAILED_TO_PARSE_FILE: { path?: string; errors?: ParseError[] }
  FAILED_TO_RUN_COMMAND: { command?: string }
  FILE_NOT_FOUND: { path?: string }
  NO_PACKAGE_MANAGER: never
  FAILED_TO_WRITE_FILE: { path?: string }
  FAILED_TO_READ_FILE: { path?: string }
  FAILED_TO_CREATE_DIRECTORY: { path?: string }
  FAILED_TO_MERGE_CONFIG: { path?: string }
  OPERATION_CANCELLED: never
}

interface InitErrors {
  FAILED_TO_INSTALL_DEPENDENCY: never
}

interface BiomeError {
  INVALID_BIOME_CONFIG: { path?: string }
}

declare module "faultier" {
  interface FaultRegistry extends CommonErrors, BiomeError, InitErrors {}
}

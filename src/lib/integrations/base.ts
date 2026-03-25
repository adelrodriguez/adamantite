type IntegrationKind = "tooling" | "workspace" | "editor" | "ci"

type IntegrationFileType = "config" | "legacy_config" | "ci"

interface IntegrationFile {
  readonly path: string
  readonly type: IntegrationFileType
}

export interface ToolingPackage {
  readonly name: string
  readonly version: string
}

interface Integration {
  readonly config?: string
  readonly files?: readonly IntegrationFile[]
  readonly kind: IntegrationKind
  readonly name: string
}

export function defineIntegration<const T extends Integration>(integration: T): T {
  return integration
}

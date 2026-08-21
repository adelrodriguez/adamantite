import { parseSync, type Program, Visitor } from "oxc-parser"
import type { RequiredConfigInspection } from "#lib/workspace/tooling/config.ts"

function getDefaultImportName(program: Program, moduleName: string): string | null {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== moduleName) {
      continue
    }

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportDefaultSpecifier") {
        return specifier.local.name
      }
    }
  }

  return null
}

function getVariableInitializer(program: Program, variableName: string) {
  for (const statement of program.body) {
    if (statement.type !== "VariableDeclaration") {
      continue
    }

    for (const declaration of statement.declarations) {
      if (declaration.id.type === "Identifier" && declaration.id.name === variableName) {
        return declaration.init
      }
    }
  }

  return null
}

function checkRangeUsesIdentifier(
  program: Program,
  identifier: string,
  range: { readonly end: number; readonly start: number }
): boolean {
  let found = false
  const visitor = new Visitor({
    Identifier: (node) => {
      if (node.start >= range.start && node.end <= range.end && node.name === identifier) {
        found = true
      }
    },
  })

  visitor.visit(program)
  return found
}

function checkExportUsesPreset(program: Program, presetIdentifier: string): boolean {
  const exports = program.body.filter((statement) => statement.type === "ExportDefaultDeclaration")

  if (exports.length !== 1) {
    return false
  }

  const declaration = exports[0]?.declaration

  if (!declaration) {
    return false
  }

  if (declaration.type !== "Identifier") {
    return checkRangeUsesIdentifier(program, presetIdentifier, declaration)
  }

  if (declaration.name === presetIdentifier) {
    return true
  }

  const initializer = getVariableInitializer(program, declaration.name)
  return initializer !== null && checkRangeUsesIdentifier(program, presetIdentifier, initializer)
}

export function inspectRequiredPresetConfig(
  content: string,
  options: {
    readonly moduleName: string
    readonly presetName: string
  }
): RequiredConfigInspection {
  const parsed = parseSync("config.ts", content, {
    astType: "ts",
    lang: "ts",
    sourceType: "module",
  })

  if (parsed.errors.length > 0) {
    return {
      kind: "invalid",
      reason: "The file is not valid TypeScript.",
    }
  }

  const presetIdentifier = getDefaultImportName(parsed.program, options.moduleName)

  if (!presetIdentifier) {
    return {
      kind: "invalid",
      reason: `The file must import the ${options.presetName} preset from \`${options.moduleName}\`.`,
    }
  }

  if (!checkExportUsesPreset(parsed.program, presetIdentifier)) {
    return {
      kind: "invalid",
      reason: `The imported ${options.presetName} preset is not used by the exported configuration.`,
    }
  }

  return { kind: "configured" }
}

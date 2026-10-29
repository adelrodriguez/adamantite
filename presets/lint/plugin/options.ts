import type { Options } from "@oxlint/plugins"

type OptionValue = Options[number]
type OptionObject = Exclude<OptionValue, OptionValue[] | boolean | number | string | null>

function isOptionObject(value: OptionValue | undefined): value is OptionObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isString(value: OptionValue | undefined): value is string {
  return typeof value === "string"
}

function isStringArray(value: OptionValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((entry) => isString(entry))
}

function isBoolean(value: OptionValue | undefined): value is boolean {
  return typeof value === "boolean"
}

function isPositiveInteger(value: OptionValue | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function readOption(options: Readonly<Options>, key: string) {
  const [first] = options

  return isOptionObject(first) ? first[key] : undefined
}

export function readStringArrayOption(
  options: Readonly<Options>,
  key: string
): string[] | undefined {
  const value = readOption(options, key)

  return isStringArray(value) ? value : undefined
}

export function readPositiveIntegerOption(
  options: Readonly<Options>,
  key: string
): number | undefined {
  const value = readOption(options, key)

  return isPositiveInteger(value) ? value : undefined
}

export function readStringOption(options: Readonly<Options>, key: string): string | undefined {
  const value = readOption(options, key)

  return isString(value) ? value : undefined
}

export function readBooleanOption(options: Readonly<Options>, key: string): boolean | undefined {
  const value = readOption(options, key)

  return isBoolean(value) ? value : undefined
}

/**
 * Read an object of string arrays, such as `{ shared: [], workspace: ["shared"] }`, from the rule's
 * first option object. Entries whose value is not a string array are dropped.
 */
export function readStringArrayRecordOption(
  options: Readonly<Options>,
  key: string
): Record<string, string[]> | undefined {
  const value = readOption(options, key)

  if (!isOptionObject(value)) {
    return undefined
  }

  const record: Record<string, string[]> = {}

  for (const [name, entry] of Object.entries(value)) {
    if (isStringArray(entry)) {
      record[name] = entry
    }
  }

  return record
}

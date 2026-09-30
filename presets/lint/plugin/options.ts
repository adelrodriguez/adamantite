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

function isPositiveInteger(value: OptionValue | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function readOption(options: Readonly<Options>, key: string) {
  const [first] = options

  return isOptionObject(first) ? first[key] : undefined
}

/**
 * Read a string array from the rule's first option object.
 */
export function readStringArrayOption(
  options: Readonly<Options>,
  key: string
): string[] | undefined {
  const value = readOption(options, key)

  return isStringArray(value) ? value : undefined
}

/**
 * Read a positive integer from the rule's first option object.
 */
export function readPositiveIntegerOption(
  options: Readonly<Options>,
  key: string
): number | undefined {
  const value = readOption(options, key)

  return isPositiveInteger(value) ? value : undefined
}

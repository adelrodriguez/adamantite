type Label = string | (() => string)

export function renderLabel(label: Label): string {
  return typeof label === "string" ? label : label()
}

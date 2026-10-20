/**
 * Replaces each `{{name}}` slot of a Markdown template with its value. A slot without a value stays
 * as written. The fill is one pass, so placeholder-like text inside a value stays literal.
 */
export function fillTemplate(template: string, slots: Readonly<Record<string, string>>): string {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    Object.hasOwn(slots, name) ? (slots[name] ?? placeholder) : placeholder
  )
}

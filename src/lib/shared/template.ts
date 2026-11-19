export function fillTemplate(template: string, slots: Readonly<Record<string, string>>): string {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (placeholder, name: string) =>
    Object.hasOwn(slots, name) ? (slots[name] ?? placeholder) : placeholder
  )
}

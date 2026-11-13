export function readConfig(text: string): boolean {
  const data = JSON.parse(text)

  return typeof data === 'object'
}

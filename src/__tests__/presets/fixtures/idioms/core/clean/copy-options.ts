export function copyOptions(options: { retries: number; timeout: number }) {
  const copy = { ...options }
  const merged = Object.assign({}, copy, { timeout: 1000 })

  return structuredClone(merged)
}

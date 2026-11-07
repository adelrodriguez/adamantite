declare function setLoading(value: boolean): void
declare function setError(error: unknown): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setLoading(true)
  try {
    await loadPage()
  } catch (error) {
    setError(error)
  }
  setLoading(false)
}

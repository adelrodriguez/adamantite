declare function setIsLoading(value: boolean): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setIsLoading(true)
  try {
    await loadPage()
  } finally {
    setIsLoading(false)
  }
}

declare function setIsLoading(value: boolean): void
declare function loadPage(): Promise<unknown>

export async function load() {
  setIsLoading(true)
  await loadPage()
  setIsLoading(false)
}

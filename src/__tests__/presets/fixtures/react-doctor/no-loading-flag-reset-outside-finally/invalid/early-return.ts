declare function setLoading(value: boolean): void
declare function loadPage(): Promise<boolean>

export async function load() {
  setLoading(true)
  if (!(await loadPage())) return
  setLoading(false)
}

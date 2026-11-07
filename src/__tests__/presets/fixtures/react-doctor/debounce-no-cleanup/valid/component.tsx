import { useEffect, useMemo } from "react"
import { debounce } from "lodash"

declare function fetchResults(query: string): Promise<unknown>

export function Search({ query }: { query: string }) {
  const search = useMemo(() => debounce(async (value: string) => {
    await fetchResults(value)
  }, 500), [])
  useEffect(() => {
    void search(query)
    return () => search.cancel()
  }, [query, search])
  return null
}

import { useQuery } from "@tanstack/react-query"

// A component outside a route file. Only route files have a loader to preload the query.
export function SearchResults({ term }: { term: string }) {
  const query = useQuery({ queryFn: () => search(term), queryKey: ["search", term] })

  return <p>{query.data?.length}</p>
}

declare function search(term: string): Promise<string[]>

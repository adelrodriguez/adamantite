import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"

export function UserName({ id }: { id: string }) {
  const options = queryOptions({ queryFn: () => fetchUser(id), queryKey: ["user", id] })
  const query = useSuspenseQuery(options)

  return <p>{query.data.name}</p>
}

declare function fetchUser(id: string): Promise<{ name: string }>

import { queryOptions } from "@tanstack/react-query"

export function userQuery(id: string) {
  return queryOptions({ queryFn: () => fetchUser(id), queryKey: ["user", id] })
}

declare function fetchUser(id: string): Promise<{ name: string }>

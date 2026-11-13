import { queryOptions } from "@tanstack/react-query"

export const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })

declare function fetchUser(): Promise<{ name: string }>

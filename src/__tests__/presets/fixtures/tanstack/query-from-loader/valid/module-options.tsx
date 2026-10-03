import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"

const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })

export const loader = ({ context }: { context: { queryClient: QueryClient } }) =>
  context.queryClient.ensureQueryData(userQuery)

export function UserName() {
  const query = useSuspenseQuery(userQuery)

  return <p>{query.data.name}</p>
}

declare function fetchUser(): Promise<{ name: string }>
declare interface QueryClient {
  ensureQueryData(options: typeof userQuery): Promise<{ name: string }>
}

import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

const userQuery = queryOptions({ queryFn: fetchUser, queryKey: ["user"] })

export const Route = createFileRoute("/user")({
  component: UserName,
  loader: ({ context }) => context.queryClient.ensureQueryData(userQuery),
})

function UserName() {
  const query = useSuspenseQuery(userQuery)

  return <p>{query.data.name}</p>
}

declare function fetchUser(): Promise<{ name: string }>

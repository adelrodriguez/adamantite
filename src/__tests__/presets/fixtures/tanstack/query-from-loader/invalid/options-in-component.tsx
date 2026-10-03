import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/users/$id")({ component: UserName })

function UserName() {
  const { id } = Route.useParams()
  const options = queryOptions({ queryFn: () => fetchUser(id), queryKey: ["user", id] })
  const query = useSuspenseQuery(options)

  return <p>{query.data.name}</p>
}

declare function fetchUser(id: string): Promise<{ name: string }>

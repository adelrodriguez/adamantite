import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { userQuery } from "./queries"

export const Route = createFileRoute("/users/$id")({
  component: UserName,
  loader: ({ context, params }) => context.queryClient.ensureQueryData(userQuery(params.id)),
})

function UserName() {
  const { id } = Route.useParams()
  const query = useQuery({ ...userQuery(id), select: (user) => user.name })

  return <p>{query.data}</p>
}

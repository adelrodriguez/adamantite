import { useQuery } from "@tanstack/react-query"
import { userQuery } from "./queries"

export function UserName({ id }: { id: string }) {
  const query = useQuery({ ...userQuery(id), select: (user) => user.name })

  return <p>{query.data}</p>
}

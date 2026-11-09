import { useQuery } from "@tanstack/react-query"
import { userQuery } from "./queries"

export function UserName() {
  const query = useQuery(userQuery)

  return <p>{query.data?.name}</p>
}

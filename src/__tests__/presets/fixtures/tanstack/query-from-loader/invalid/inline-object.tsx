import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/user")({ component: UserName })

function UserName() {
  const query = useQuery({ queryFn: fetchUser, queryKey: ["user"] })

  return <p>{query.data?.name}</p>
}

declare function fetchUser(): Promise<{ name: string }>

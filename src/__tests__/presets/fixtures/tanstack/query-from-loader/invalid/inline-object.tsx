import { useQuery } from "@tanstack/react-query"

export function UserName() {
  const query = useQuery({ queryFn: fetchUser, queryKey: ["user"] })

  return <p>{query.data?.name}</p>
}

declare function fetchUser(): Promise<{ name: string }>

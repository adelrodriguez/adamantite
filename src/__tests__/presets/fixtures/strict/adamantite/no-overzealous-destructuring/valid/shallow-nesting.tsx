import { useQuery } from "@tanstack/react-query"

export function UserName() {
  const {
    data: { user },
  } = useQuery({ queryFn: fetchUser, queryKey: ["user"] })

  return <p>{user.name}</p>
}

declare function fetchUser(): Promise<{ user: { name: string } }>

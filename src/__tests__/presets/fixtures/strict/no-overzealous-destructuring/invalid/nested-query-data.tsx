import { useQuery } from "@tanstack/react-query"

export function UserName() {
  const {
    data: {
      user: { name },
    },
  } = useQuery({ queryFn: fetchUser, queryKey: ["user"] })

  return <p>{name}</p>
}

declare function fetchUser(): Promise<{ user: { name: string } }>

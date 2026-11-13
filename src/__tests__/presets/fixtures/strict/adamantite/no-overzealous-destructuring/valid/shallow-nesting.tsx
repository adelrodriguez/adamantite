export function UserName() {
  const {
    data: { user },
  } = useQuery({ queryFn: fetchUser, queryKey: ["user"] })

  return <p>{user.name}</p>
}

declare function fetchUser(): Promise<{ user: { name: string } }>

declare function useQuery<Data>(query: {
  readonly queryFn: () => Promise<Data>
  readonly queryKey: readonly string[]
}): { readonly data: Data }

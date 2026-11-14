import { queryOptions, useQuery } from "@tanstack/react-query"

const postsQuery = queryOptions({
  queryFn: () => Promise.resolve([{ id: "one", title: "First" }]),
  queryKey: ["posts"],
})

export function usePosts() {
  return useQuery(postsQuery)
}

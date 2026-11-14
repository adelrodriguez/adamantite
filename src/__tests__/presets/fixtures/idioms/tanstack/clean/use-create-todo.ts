import { useMutation, useQueryClient } from "@tanstack/react-query"

export function useCreateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (text: string) => Promise.resolve({ text }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  })
}

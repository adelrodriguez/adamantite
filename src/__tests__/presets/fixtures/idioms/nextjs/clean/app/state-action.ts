"use server"

export async function createTodoState(_state: { message: string }, formData: FormData) {
  return { message: formData.has("todo") ? "Added todo" : "Missing todo" }
}

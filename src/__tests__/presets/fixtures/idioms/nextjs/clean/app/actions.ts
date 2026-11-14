"use server"

function isText(value: FormDataEntryValue | null): value is string {
  return typeof value === "string"
}

export async function createTodo(formData: FormData) {
  const text = formData.get("todo")

  if (!isText(text)) {
    throw new TypeError("Todo must be text")
  }

  await Promise.resolve(text)
}

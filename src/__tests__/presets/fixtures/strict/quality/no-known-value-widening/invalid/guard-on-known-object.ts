type User = { readonly id: string }

function isUser(value: unknown): value is User {
  return typeof value === "object" && value !== null && "id" in value
}

export const result = isUser({ id: "known" })

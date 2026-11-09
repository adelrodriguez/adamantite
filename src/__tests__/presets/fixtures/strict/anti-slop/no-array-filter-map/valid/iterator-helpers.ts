const users = [{ active: true, email: "ada@example.com" }]

export const emails = users
  .values()
  .filter((user) => user.active)
  .map((user) => user.email)
  .toArray()

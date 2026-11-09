const users = [{ active: true, email: "ada@example.com" }]

export const emails = users.filter((user) => user.active).map((user) => user.email)

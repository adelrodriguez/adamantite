const users = [{ active: true, email: "ada@example.com" }]

export const emails = users.flatMap((user) => (user.active ? [user.email] : []))

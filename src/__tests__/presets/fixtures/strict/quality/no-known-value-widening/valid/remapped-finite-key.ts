type Field = "name" | "email"

export const getters: { [Key in Field as `get${Capitalize<Key>}`]: () => string } = {
  getEmail: () => "a@example.com",
  getName: () => "Ada",
}

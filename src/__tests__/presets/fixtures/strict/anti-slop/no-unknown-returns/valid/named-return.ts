interface User { id: string }
declare const user: User
export function load(): User {
  return user
}

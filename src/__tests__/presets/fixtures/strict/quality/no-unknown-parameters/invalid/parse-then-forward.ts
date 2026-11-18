import { z } from "zod"

const User = z.object({ id: z.string() })

export function forward(value: unknown): void {
  User.parse(value)
  console.info(value)
}

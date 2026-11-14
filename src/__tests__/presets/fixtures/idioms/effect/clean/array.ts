import { Array } from "effect"

export const doubled = Array.map([1, 2, 3], (value) => value * 2)
export const first = Array.head(doubled)

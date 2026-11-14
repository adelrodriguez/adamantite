import { String } from "effect"

export const words = String.split("hello world", " ")
export const normalized = String.trim(" hello ")

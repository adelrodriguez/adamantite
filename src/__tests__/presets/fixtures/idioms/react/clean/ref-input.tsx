import type { ComponentProps } from "react"

export function RefInput({ ref, ...props }: ComponentProps<"input">) {
  return <input ref={ref} {...props} />
}

import type { ComponentProps } from "react"

function cn(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("h-9 w-full rounded-md border px-3 py-1", className)}
      {...props}
    />
  )
}

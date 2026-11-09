import type { ComponentProps } from "react"

interface Props extends ComponentProps<"button"> {
  size: "lg" | "sm"
  variant: "ghost" | "solid"
}

export function Button({ children, className, size, type, variant, ...props }: Props) {
  return (
    <button className={`${className} ${size} ${variant}`} type={type} {...props}>
      {children}
    </button>
  )
}

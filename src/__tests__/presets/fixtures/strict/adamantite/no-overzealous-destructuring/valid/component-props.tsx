import type { ComponentProps } from "react"

interface Props extends ComponentProps<"div"> {
  size: "lg" | "sm"
  variant: "ghost" | "solid"
}

export function Card({ children, className, size, title, variant, ...props }: Props) {
  return (
    <div className={`${className} ${size} ${variant}`} title={title} {...props}>
      {children}
    </div>
  )
}

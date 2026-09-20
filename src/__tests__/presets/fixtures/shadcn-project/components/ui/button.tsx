import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

const SIZES = { lg: "h-9 px-4", sm: "h-7 px-2.5" }

export function Button({
  className,
  size = "sm",
  ...props
}: ComponentProps<"button"> & { size?: "lg" | "sm" }) {
  return (
    <button
      className={cn("rounded-lg bg-primary text-primary-foreground ring-[3px]", SIZES[size], className)}
      {...props}
    />
  )
}

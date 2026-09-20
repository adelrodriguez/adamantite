import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const Save = ({ wide }: { wide: boolean }) => (
  <Button className={cn("mt-4", wide && "w-full")}>Save</Button>
)

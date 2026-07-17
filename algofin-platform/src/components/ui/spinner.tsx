import { cn } from "@/lib/utils"

interface SpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClass = size === "sm" ? "w-4 h-4 border-[1.5px]" : size === "lg" ? "w-7 h-7 border-2" : "w-5 h-5 border-2"
  return (
    <div className={cn("flex justify-center p-10", className)}>
      <div className={cn(sizeClass, "border-primary/30 border-t-primary rounded-full animate-spin")} />
    </div>
  )
}

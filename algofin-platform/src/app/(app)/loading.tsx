import { Spinner } from "@/components/ui/spinner"

export default function AppLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Spinner />
      <p className="text-sm text-muted-foreground animate-pulse">Loading your dashboard&hellip;</p>
    </div>
  )
}

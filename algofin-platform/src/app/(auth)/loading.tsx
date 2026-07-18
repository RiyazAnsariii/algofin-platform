import { Spinner } from "@/components/ui/spinner"

export default function AuthLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  )
}

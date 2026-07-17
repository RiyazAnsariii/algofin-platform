import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("surface-card p-10 text-center space-y-3", className)}>
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-2">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-sm mx-auto">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}

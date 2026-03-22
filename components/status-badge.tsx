import type { ComponentProps } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

const statusStyles: Record<
  string,
  { variant: BadgeVariant; className?: string }
> = {
  planned: { variant: "secondary" },
  budgeted: { variant: "secondary" },
  received: {
    variant: "outline",
    className: "border-amber-300 bg-amber-50 text-amber-950",
  },
  accepted: {
    variant: "outline",
    className: "border-emerald-300 bg-emerald-50 text-emerald-950",
  },
  approved: {
    variant: "outline",
    className: "border-emerald-300 bg-emerald-50 text-emerald-950",
  },
  issued: {
    variant: "outline",
    className: "border-blue-300 bg-blue-50 text-blue-950",
  },
  paid: {
    variant: "outline",
    className: "border-emerald-300 bg-emerald-50 text-emerald-950",
  },
  overdue: { variant: "destructive" },
  done: {
    variant: "outline",
    className: "border-emerald-300 bg-emerald-50 text-emerald-950",
  },
  backlog: { variant: "outline", className: "text-muted-foreground" },
  todo: { variant: "secondary" },
  in_progress: {
    variant: "outline",
    className: "border-blue-300 bg-blue-50 text-blue-950",
  },
  blocked: { variant: "destructive" },
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusStyles[status] || {
    variant: "outline" as BadgeVariant,
    className: "text-muted-foreground",
  }

  return (
    <Badge
      variant={config.variant}
      className={cn(
        "px-2 py-0.5 text-[11px] font-medium tracking-[0.08em]",
        config.className,
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  )
}

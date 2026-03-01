import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusStyles: Record<string, string> = {
  planned: "border-border bg-secondary text-foreground",
  budgeted: "border-border bg-secondary text-foreground",
  received: "border-amber-300 bg-amber-100 text-amber-950",
  accepted: "border-emerald-300 bg-emerald-100 text-emerald-950",
  approved: "border-emerald-300 bg-emerald-100 text-emerald-950",
  issued: "border-blue-300 bg-blue-100 text-blue-950",
  paid: "border-emerald-300 bg-emerald-100 text-emerald-950",
  overdue: "border-red-300 bg-red-100 text-red-950",
  done: "border-emerald-300 bg-emerald-100 text-emerald-950",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em]",
        statusStyles[status] || "border-border bg-card text-muted-foreground",
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  )
}

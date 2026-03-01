import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  eyebrow: string
  value: string
  detail?: string
  tone?: "default" | "accent" | "danger"
  delta?: {
    label: string
    direction: "up" | "down" | "flat"
    placement?: "bottom" | "top-right"
    tone?: "default" | "success"
  }
}

export function StatCard({
  eyebrow,
  value,
  detail,
  tone = "default",
  delta,
}: StatCardProps) {
  const toneClasses = {
    default: "bg-card",
    accent: "bg-[rgba(255,72,0,0.10)]",
    danger: "bg-[rgba(186,26,26,0.08)]",
  }

  const Icon =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : Minus

  return (
    <Card className={cn("gap-3 border-border/80 py-0", toneClasses[tone])}>
      <CardHeader className="gap-2 px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </p>
            <CardTitle className="mt-2 text-3xl font-medium tracking-tight">{value}</CardTitle>
          </div>
          {delta?.placement === "top-right" ? (
            <p
              className={cn(
                "inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]",
                delta.tone === "success" ? "text-emerald-700" : "text-muted-foreground",
              )}
            >
              {delta.tone === "success" ? (
                <span className="size-2 rounded-full bg-emerald-600" />
              ) : (
                <Icon className="size-3.5" />
              )}
              {delta.label}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        {delta && delta.placement !== "top-right" ? (
          <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Icon className="size-3.5" />
            {delta.label}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type MetricCardProps = {
  label: string
  value: string
  detail?: string
}

export function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <Card className="border-border/70 py-0">
      <CardHeader className="px-5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <CardTitle className="mt-2 text-3xl font-medium tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : <div className="h-2.5" />}
      </CardContent>
    </Card>
  )
}

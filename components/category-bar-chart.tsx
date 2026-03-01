"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
} from "@/components/ui/chart"

type CategoryBarChartProps = {
  data: Array<{
    name: string
    budget: number
    committed: number
    paid: number
  }>
}

const chartConfig = {
  budget: { label: "Budget remaining", color: "rgba(107, 114, 128, 0.28)" },
  committed: { label: "Committed unpaid", color: "rgba(255, 72, 0, 0.88)" },
  paid: { label: "Paid", color: "rgba(15, 23, 42, 1)" },
} as const

export function CategoryBarChart({ data }: CategoryBarChartProps) {
  const remainingData = data.map((category) => ({
    ...category,
    budget: Math.max(category.budget - category.committed, 0),
    committed: Math.max(category.committed - category.paid, 0),
    paid: Math.max(category.paid, 0),
  }))

  return (
    <ChartContainer
      config={chartConfig}
      className="h-[320px] w-full border border-border/70 bg-card p-4"
    >
      <BarChart data={remainingData} barCategoryGap="28%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} height={12} />
        <YAxis tickFormatter={(value) => `£${Math.round(value / 1000)}k`} />
        <Tooltip content={<ChartTooltipContent />} />
        <Legend content={<ChartLegendContent />} />
        <Bar dataKey="budget" stackId="category" fill="var(--color-budget)" />
        <Bar dataKey="committed" stackId="category" fill="var(--color-committed)" />
        <Bar dataKey="paid" stackId="category" fill="var(--color-paid)" />
      </BarChart>
    </ChartContainer>
  )
}

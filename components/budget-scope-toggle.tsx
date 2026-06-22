"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Switch } from "@/components/ui/switch"

type BudgetScopeToggleProps = {
  constructionOnly: boolean
}

export function BudgetScopeToggle({ constructionOnly }: BudgetScopeToggleProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleCheckedChange(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString())

    if (checked) {
      params.set("scope", "construction")
    } else {
      params.delete("scope")
    }

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <label className="inline-flex items-center gap-3 text-sm text-foreground">
      <Switch checked={constructionOnly} onCheckedChange={handleCheckedChange} />
      <span className="flex flex-col">
        <span className="font-medium">Construction only</span>
        <span className="text-xs text-muted-foreground">Hide professional fees</span>
      </span>
    </label>
  )
}

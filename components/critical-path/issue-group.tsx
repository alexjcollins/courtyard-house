"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { IssueRow } from "@/components/critical-path/issue-row"
import type { LinearViewIssue } from "@/lib/linear"

export type IssueGroupModel = {
  key: string
  label: string
  /** Rendered to the left of the label — a state ring, a priority glyph, an avatar. */
  icon: React.ReactNode
  issues: LinearViewIssue[]
  defaultOpen: boolean
}

export function IssueGroup({
  group,
  selectedId,
  onSelect,
}: {
  group: IssueGroupModel
  selectedId: string | null
  onSelect: (identifier: string) => void
}) {
  const [isOpen, setIsOpen] = useState(group.defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 border-b border-border/70 bg-secondary/40 px-4 py-2.5 text-left transition-colors hover:bg-secondary/70">
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        {group.icon}
        <span className="text-sm font-medium text-foreground">{group.label}</span>
        <span className="text-xs text-muted-foreground">{group.issues.length}</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {group.issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            isSelected={issue.identifier === selectedId}
            onSelect={onSelect}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

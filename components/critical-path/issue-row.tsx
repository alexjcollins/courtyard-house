"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PriorityIcon, StateIcon } from "@/components/critical-path/linear-icons"
import { isOverdue } from "@/lib/critical-path-utils"
import { formatShortDate } from "@/lib/format"
import type { LinearViewIssue } from "@/lib/linear"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_LABELS = 2

export function IssueRow({
  issue,
  isSelected,
  onSelect,
}: {
  issue: LinearViewIssue
  isSelected: boolean
  onSelect: (identifier: string) => void
}) {
  const overdue = isOverdue(issue)
  const visibleLabels = issue.labels.slice(0, MAX_VISIBLE_LABELS)
  const hiddenLabelCount = issue.labels.length - visibleLabels.length

  return (
    <button
      type="button"
      onClick={() => onSelect(issue.identifier)}
      data-selected={isSelected}
      aria-label={`${issue.identifier}: ${issue.title}`}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors last:border-b-0",
        "hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
        "data-[selected=true]:bg-secondary/80",
      )}
    >
      <PriorityIcon priority={issue.priority} />

      <span className="w-[76px] shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        {issue.identifier}
      </span>

      <StateIcon
        type={issue.state.type}
        color={issue.state.color}
        name={issue.state.name}
      />

      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {issue.title}
      </span>

      {visibleLabels.length > 0 ? (
        <span className="hidden shrink-0 items-center gap-1.5 @2xl:flex">
          {visibleLabels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
          {hiddenLabelCount > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              +{hiddenLabelCount}
            </span>
          ) : null}
        </span>
      ) : null}

      {issue.milestone ? (
        <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground @3xl:block @3xl:max-w-[160px]">
          {issue.milestone.name}
        </span>
      ) : null}

      <span
        className={cn(
          "hidden w-[64px] shrink-0 text-right text-[11px] @md:block",
          overdue ? "text-[color:var(--accent)]" : "text-muted-foreground",
        )}
      >
        {issue.dueDate ? formatShortDate(issue.dueDate) : ""}
      </span>

      {issue.assignee ? (
        <Avatar className="size-5 shrink-0">
          {issue.assignee.avatarUrl ? (
            <AvatarImage src={issue.assignee.avatarUrl} alt={issue.assignee.name} />
          ) : null}
          <AvatarFallback className="text-[9px] font-medium">
            {issue.assignee.initials}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span
          className="size-5 shrink-0 rounded-full border border-dashed border-border"
          aria-label="Unassigned"
        />
      )}
    </button>
  )
}

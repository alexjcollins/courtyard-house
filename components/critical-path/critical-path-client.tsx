"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { IssueDrawer } from "@/components/critical-path/issue-drawer"
import { IssueGroup, type IssueGroupModel } from "@/components/critical-path/issue-group"
import { PriorityIcon, StateIcon, priorityLabel } from "@/components/critical-path/linear-icons"
import {
  CLOSED_STATE_TYPES,
  PRIORITY_RANK,
  STATE_TYPE_RANK,
  compareIssues,
  isClosed,
} from "@/lib/critical-path-utils"
import type { LinearPriority, LinearViewIssue } from "@/lib/linear"
import { cn } from "@/lib/utils"

type Scope = "open" | "all" | "done"
type GroupBy = "status" | "priority" | "assignee" | "milestone"

const SCOPES: Array<{ value: Scope; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "done", label: "Done" },
]

const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "milestone", label: "Milestone" },
]

function matchesQuery(issue: LinearViewIssue, query: string): boolean {
  const haystack = [
    issue.identifier,
    issue.title,
    issue.assignee?.name ?? "",
    ...issue.labels.map((label) => label.name),
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

/**
 * @param expandClosed opens the completed/cancelled groups, which are otherwise
 *   collapsed. Set when the viewer has deliberately narrowed to finished work (or is
 *   searching), where a collapsed group reads as "no results".
 */
function buildGroups(
  issues: LinearViewIssue[],
  groupBy: GroupBy,
  expandClosed: boolean,
): IssueGroupModel[] {
  if (groupBy === "priority") {
    const byPriority = new Map<LinearPriority, LinearViewIssue[]>()
    for (const issue of issues) {
      byPriority.set(issue.priority, [...(byPriority.get(issue.priority) || []), issue])
    }

    return [...byPriority.entries()]
      .sort(([a], [b]) => PRIORITY_RANK[a] - PRIORITY_RANK[b])
      .map(([priority, groupIssues]) => ({
        key: `priority-${priority}`,
        label: priorityLabel(priority),
        icon: <PriorityIcon priority={priority} className="size-3.5" />,
        issues: groupIssues.sort(compareIssues),
        defaultOpen: true,
      }))
  }

  if (groupBy === "assignee") {
    const byAssignee = new Map<string, LinearViewIssue[]>()
    for (const issue of issues) {
      const key = issue.assignee?.key || "unassigned"
      byAssignee.set(key, [...(byAssignee.get(key) || []), issue])
    }

    return [...byAssignee.entries()]
      .map(([key, groupIssues]) => {
        const assignee = groupIssues[0].assignee
        return {
          key: `assignee-${key}`,
          label: assignee?.name || "Unassigned",
          icon: assignee ? (
            <Avatar className="size-4">
              {assignee.avatarUrl ? (
                <AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
              ) : null}
              <AvatarFallback className="text-[8px] font-medium">
                {assignee.initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="size-4 rounded-full border border-dashed border-border" />
          ),
          issues: groupIssues.sort(compareIssues),
          defaultOpen: true,
        }
      })
      .sort((a, b) => {
        if (a.label === "Unassigned") return 1
        if (b.label === "Unassigned") return -1
        return a.label.localeCompare(b.label)
      })
  }

  if (groupBy === "milestone") {
    const byMilestone = new Map<string, LinearViewIssue[]>()
    for (const issue of issues) {
      const key = issue.milestone?.id || "none"
      byMilestone.set(key, [...(byMilestone.get(key) || []), issue])
    }

    return [...byMilestone.entries()]
      .map(([key, groupIssues]) => ({
        key: `milestone-${key}`,
        label: groupIssues[0].milestone?.name || "No milestone",
        icon: <span className="size-1.5 rounded-full bg-muted-foreground" />,
        issues: groupIssues.sort(compareIssues),
        defaultOpen: true,
        targetDate: groupIssues[0].milestone?.targetDate || null,
      }))
      .sort((a, b) => {
        if (!a.targetDate) return 1
        if (!b.targetDate) return -1
        return a.targetDate.localeCompare(b.targetDate)
      })
      .map(({ targetDate: _targetDate, ...group }) => group)
  }

  // Status — the default. Ordered so live work sits above finished work.
  const byState = new Map<string, LinearViewIssue[]>()
  for (const issue of issues) {
    byState.set(issue.state.id, [...(byState.get(issue.state.id) || []), issue])
  }

  return [...byState.values()]
    .map((groupIssues) => {
      const state = groupIssues[0].state
      return {
        key: `status-${state.id}`,
        label: state.name,
        icon: <StateIcon type={state.type} color={state.color} name={state.name} />,
        issues: groupIssues.sort(compareIssues),
        defaultOpen: expandClosed || !CLOSED_STATE_TYPES.includes(state.type),
        rank: STATE_TYPE_RANK[state.type],
        position: state.position,
      }
    })
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map(({ rank: _rank, position: _position, ...group }) => group)
}

export function CriticalPathClient({
  issues,
  initialTaskId,
}: {
  issues: LinearViewIssue[]
  initialTaskId: string | null
}) {
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<Scope>("open")
  const [groupBy, setGroupBy] = useState<GroupBy>("status")
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!initialTaskId) return null
    const match = issues.find(
      (issue) => issue.identifier.toUpperCase() === initialTaskId.toUpperCase(),
    )
    return match?.identifier ?? null
  })

  /**
   * Selection lives in local state and is mirrored to the URL with replaceState.
   * router.replace would be wrong here: the page reads cookies, so it is dynamic, and
   * every drawer open would trigger a full RSC round trip that re-fetches Linear.
   */
  const selectIssue = useCallback((identifier: string | null) => {
    setSelectedId(identifier)

    const url = new URL(window.location.href)
    if (identifier) url.searchParams.set("task", identifier)
    else url.searchParams.delete("task")
    window.history.replaceState(null, "", url)
  }, [])

  // Keep the drawer in step with browser back/forward.
  useEffect(() => {
    function handlePopState() {
      const task = new URL(window.location.href).searchParams.get("task")
      setSelectedId(task)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const filtered = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase()

    return issues.filter((issue) => {
      if (scope === "open" && isClosed(issue)) return false
      if (scope === "done" && !isClosed(issue)) return false
      if (normalisedQuery && !matchesQuery(issue, normalisedQuery)) return false
      return true
    })
  }, [issues, query, scope])

  const expandClosed = scope === "done" || query.trim().length > 0

  const groups = useMemo(
    () => buildGroups(filtered, groupBy, expandClosed),
    [filtered, groupBy, expandClosed],
  )

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.identifier === selectedId) ?? null,
    [issues, selectedId],
  )

  // j/k and arrow keys move through the visible list, as in Linear.
  const orderedVisible = useMemo(
    () => groups.flatMap((group) => group.issues),
    [groups],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!selectedId) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return
      }

      const isNext = event.key === "ArrowDown" || event.key === "j"
      const isPrevious = event.key === "ArrowUp" || event.key === "k"
      if (!isNext && !isPrevious) return

      const index = orderedVisible.findIndex(
        (issue) => issue.identifier === selectedId,
      )
      if (index === -1) return

      const nextIndex = isNext ? index + 1 : index - 1
      const next = orderedVisible[nextIndex]
      if (!next) return

      event.preventDefault()
      selectIssue(next.identifier)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [orderedVisible, selectIssue, selectedId])

  const hasResults = filtered.length > 0

  return (
    // @container: the list now lives in a half-width column, so rows and toolbar
    // respond to the column's width, not the viewport's.
    <div className="@container space-y-6">
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="relative w-full @2xl:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={cn(
                "inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm transition-colors",
                scope === option.value
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}

          <Select
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as GroupBy)}
          >
            <SelectTrigger className="w-[150px]" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasResults ? (
        <Card className="overflow-hidden border-border/70 py-0">
          {groups.map((group) => (
            <IssueGroup
              // IssueGroup owns its open/closed state, so the key carries the
              // expand flag: flipping it remounts the group with fresh defaults
              // instead of leaving a stale collapsed section behind.
              key={`${group.key}-${expandClosed ? "expanded" : "default"}`}
              group={group}
              selectedId={selectedId}
              onSelect={selectIssue}
            />
          ))}
        </Card>
      ) : (
        <div className="border border-dashed border-border/70 bg-secondary/30 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {issues.length === 0
              ? "No tasks in this project yet."
              : "No tasks match this filter."}
          </p>
          {issues.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setScope("all")
              }}
              className="mt-3 inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}

      <IssueDrawer issue={selectedIssue} onClose={() => selectIssue(null)} />
    </div>
  )
}

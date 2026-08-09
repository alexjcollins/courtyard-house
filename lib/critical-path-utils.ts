import type { LinearPriority, LinearStateType, LinearViewIssue } from "@/lib/linear"

// Pure helpers shared by the server page (for the metric tiles) and the client list.
// No "server-only" — this is imported from both sides, so nothing here may reach into
// lib/linear.ts at runtime (type-only imports are erased and therefore fine).

/**
 * Images and files pasted into Linear live on uploads.linear.app and are private, so
 * they have to be proxied. Exact hostname equality on purpose — an endsWith or includes
 * check is defeated by evil.uploads.linear.app.attacker.com.
 */
export function isLinearUploadUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "uploads.linear.app"
  } catch {
    return false
  }
}

/**
 * Group ordering. Deliberately not Linear's raw state position: this page exists to
 * show what is still outstanding, so live work floats up and finished work sinks.
 */
export const STATE_TYPE_RANK: Record<LinearStateType, number> = {
  started: 0,
  unstarted: 1,
  triage: 2,
  backlog: 3,
  completed: 4,
  canceled: 5,
}

/** Urgent first, "no priority" last — the raw integer sorts wrongly because 0 = none. */
export const PRIORITY_RANK: Record<LinearPriority, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
}

export const CLOSED_STATE_TYPES: LinearStateType[] = ["completed", "canceled"]

export function isClosed(issue: LinearViewIssue): boolean {
  return CLOSED_STATE_TYPES.includes(issue.state.type)
}

export function isOverdue(issue: LinearViewIssue, today = new Date()): boolean {
  if (!issue.dueDate || isClosed(issue)) return false
  const due = new Date(issue.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  return due < startOfToday
}

/** Within a group: manual board order, then urgency, then the nearest due date. */
export function compareIssues(a: LinearViewIssue, b: LinearViewIssue): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder

  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priority !== 0) return priority

  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1

  return a.identifier.localeCompare(b.identifier)
}

/**
 * Build-programme milestones carry a flat `status` string that is "planned" for
 * everything. This derives a truthful display status: anything with a recorded
 * actualDate (or an explicit done) reads as complete, and anything still open whose
 * planned date has passed reads as late rather than silently "planned".
 */
export function deriveMilestoneStatus(
  milestone: { plannedDate: string; actualDate?: string; status: string },
  today = new Date(),
): string {
  if (milestone.status === "done" || milestone.actualDate) return "done"

  const planned = new Date(milestone.plannedDate)
  if (Number.isNaN(planned.getTime())) return milestone.status

  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )

  return planned < startOfToday ? "late" : milestone.status
}

export type IssueSummary = {
  total: number
  open: number
  inProgress: number
  overdue: number
  done: number
}

export function summariseIssues(issues: LinearViewIssue[]): IssueSummary {
  return {
    total: issues.length,
    open: issues.filter((issue) => !isClosed(issue)).length,
    inProgress: issues.filter((issue) => issue.state.type === "started").length,
    overdue: issues.filter((issue) => isOverdue(issue)).length,
    done: issues.filter((issue) => issue.state.type === "completed").length,
  }
}

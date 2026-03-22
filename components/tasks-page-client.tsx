"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type {
  Task,
  TaskAssignee,
  TaskPriority,
  TaskReferenceOption,
  TaskRelationType,
  TaskStatus,
} from "@/lib/data"
import type { OrganizationUser } from "@/lib/workos"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

type TasksPageClientProps = {
  initialTasks: Task[]
  relatedOptions: TaskReferenceOption[]
  assignableUsers: OrganizationUser[]
  canEdit: boolean
}

type TaskFormState = {
  taskId: string | null
  title: string
  status: TaskStatus
  priority: TaskPriority
  assigneeUserId: string
  dueDate: string
  notes: string
  related: Array<{
    type: TaskRelationType
    id: string
  }>
}

const EMPTY_FORM: TaskFormState = {
  taskId: null,
  title: "",
  status: "todo",
  priority: "medium",
  assigneeUserId: "",
  dueDate: "",
  notes: "",
  related: [],
}

function priorityLabel(priority: TaskPriority) {
  return priority.replaceAll("_", " ")
}

function createFormState(task?: Task): TaskFormState {
  if (!task) {
    return EMPTY_FORM
  }

  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assigneeUserId: task.assignee?.userId || "",
    dueDate: task.dueDate || "",
    notes: task.notes || "",
    related: (task.related || []).map((relation) => ({
      type: relation.type,
      id: relation.id,
    })),
  }
}

export function TasksPageClient({
  initialTasks,
  relatedOptions,
  assignableUsers,
  canEdit,
}: TasksPageClientProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [assigneeFilter, setAssigneeFilter] = useState("all")
  const [relatedFilter, setRelatedFilter] = useState("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM)

  const assigneeOptions = useMemo(() => {
    const savedAssignees = tasks
      .map((task) => task.assignee)
      .filter(Boolean) as TaskAssignee[]

    return [...assignableUsers, ...savedAssignees]
      .filter(
        (candidate, index, all) =>
          all.findIndex((entry) => entry.userId === candidate.userId) === index,
      )
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [assignableUsers, tasks])

  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return tasks.filter((task) => {
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false
      }

      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false
      }

      if (assigneeFilter !== "all" && task.assignee?.userId !== assigneeFilter) {
        return false
      }

      if (
        relatedFilter !== "all" &&
        !(task.related || []).some((relation) => relation.type === relatedFilter)
      ) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = [
        task.code,
        task.title,
        task.notes,
        task.assignee?.name,
        task.assignee?.email,
        ...(task.related || []).map((relation) => relation.label),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(normalizedSearch)
    })
  }, [assigneeFilter, priorityFilter, relatedFilter, search, statusFilter, tasks])

  const summary = useMemo(
    () => ({
      open: tasks.filter((task) => task.status !== "done").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      done: tasks.filter((task) => task.status === "done").length,
    }),
    [tasks],
  )

  const decisionOptions = relatedOptions.filter((option) => option.type === "decision")
  const milestoneOptions = relatedOptions.filter((option) => option.type === "milestone")

  function openCreateDialog() {
    setError(null)
    setForm(EMPTY_FORM)
    setIsDialogOpen(true)
  }

  function openEditDialog(task: Task) {
    setError(null)
    setForm(createFormState(task))
    setIsDialogOpen(true)
  }

  function toggleRelation(type: TaskRelationType, id: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      related: checked
        ? [...current.related, { type, id }]
        : current.related.filter(
            (relation) => !(relation.type === type && relation.id === id),
          ),
    }))
  }

  async function saveTask() {
    setIsSaving(true)
    setError(null)

    try {
      const assignee = assigneeOptions.find((user) => user.userId === form.assigneeUserId)
      const response = await fetch("/api/tasks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: form.taskId || undefined,
          title: form.title,
          status: form.status,
          priority: form.priority,
          assignee: assignee
            ? {
                userId: assignee.userId,
                name: assignee.name,
                email: assignee.email,
                role: assignee.role,
              }
            : undefined,
          dueDate: form.dueDate || undefined,
          notes: form.notes || undefined,
          related: form.related,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Could not save task.")
      }

      setTasks((current) => {
        const nextTask = payload.task as Task
        const existingIndex = current.findIndex((task) => task.id === nextTask.id)
        if (existingIndex === -1) {
          return [nextTask, ...current]
        }

        const next = [...current]
        next[existingIndex] = nextTask
        return next
      })
      setIsDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.")
    } finally {
      setIsSaving(false)
    }
  }

  async function removeTask() {
    if (!form.taskId) {
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch("/api/tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: form.taskId }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Could not delete task.")
      }

      setTasks((current) => current.filter((task) => task.id !== form.taskId))
      setIsDialogOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete task.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Open tasks" value={String(summary.open)} />
        <MetricCard label="In progress" value={String(summary.inProgress)} />
        <MetricCard label="Done" value={String(summary.done)} />
      </div>

      <div className="border border-border/70 bg-card px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(4,minmax(0,0.7fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks, notes, assignees, or linked items"
                className="pl-9"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="backlog">Backlog</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="h-10 border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className="h-10 border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">All assignees</option>
              {assigneeOptions.map((assignee) => (
                <option key={assignee.userId} value={assignee.userId}>
                  {assignee.name}
                </option>
              ))}
            </select>

            <select
              value={relatedFilter}
              onChange={(event) => setRelatedFilter(event.target.value)}
              className="h-10 border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">All links</option>
              <option value="decision">Decisions</option>
              <option value="milestone">Timeline</option>
            </select>
          </div>

          {canEdit ? (
            <Button type="button" onClick={openCreateDialog}>
              Add task
            </Button>
          ) : null}
        </div>
      </div>

      <div className="border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Related</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleTasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No tasks match the current search or filters.
                </TableCell>
              </TableRow>
            ) : (
              visibleTasks.map((task) => (
                <TableRow
                  key={task.id}
                  className={cn(canEdit ? "cursor-pointer" : "")}
                  onClick={canEdit ? () => openEditDialog(task) : undefined}
                >
                  <TableCell>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {task.code}
                      </p>
                      <p className="mt-1 font-medium text-foreground">{task.title}</p>
                      {task.notes ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {task.notes}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(task.related || []).length > 0
                      ? (task.related || []).map((relation) => relation.label).join(" · ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {task.assignee?.name || "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="text-sm capitalize text-foreground">
                    {priorityLabel(task.priority)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {task.dueDate ? formatDate(task.dueDate) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[calc(100vw-80px)] max-w-[1800px] border-border/70 sm:max-w-[1800px] max-h-[calc(100vh-80px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.taskId ? "Edit task" : "Add task"}</DialogTitle>
            <DialogDescription>
              Assign ownership, track status, and link work back to decisions or timeline milestones.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="What needs to happen?"
                    disabled={!canEdit || isSaving}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          status: event.target.value as TaskStatus,
                        }))
                      }
                      className="h-10 border border-border/70 bg-background px-3 text-sm"
                      disabled={!canEdit || isSaving}
                    >
                      <option value="backlog">Backlog</option>
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="blocked">Blocked</option>
                      <option value="done">Done</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Priority</label>
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          priority: event.target.value as TaskPriority,
                        }))
                      }
                      className="h-10 border border-border/70 bg-background px-3 text-sm"
                      disabled={!canEdit || isSaving}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Assignee</label>
                    <select
                      value={form.assigneeUserId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          assigneeUserId: event.target.value,
                        }))
                      }
                      className="h-10 border border-border/70 bg-background px-3 text-sm"
                      disabled={!canEdit || isSaving}
                    >
                      <option value="">Unassigned</option>
                      {assigneeOptions.map((assignee) => (
                        <option key={assignee.userId} value={assignee.userId}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Due date</label>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, dueDate: event.target.value }))
                      }
                      disabled={!canEdit || isSaving}
                    />
                  </div>
                </div>
              </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Context, blockers, or handoff notes"
                    disabled={!canEdit || isSaving}
                    className="min-h-48"
                  />
                </div>
              </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="border border-border/70 bg-card px-4 py-4">
                <p className="text-sm font-medium text-foreground">Related decisions</p>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2">
                  {decisionOptions.map((option) => {
                    const checked = form.related.some(
                      (relation) => relation.type === option.type && relation.id === option.id,
                    )

                    return (
                      <label
                        key={`${option.type}-${option.id}`}
                        className="flex items-start gap-3 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleRelation(option.type, option.id, value === true)
                          }
                          disabled={!canEdit || isSaving}
                        />
                        <span>
                          <span className="block text-foreground">{option.label}</span>
                          {option.meta ? (
                            <span className="block text-muted-foreground">{option.meta}</span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="border border-border/70 bg-card px-4 py-4">
                <p className="text-sm font-medium text-foreground">Related timeline items</p>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2">
                  {milestoneOptions.map((option) => {
                    const checked = form.related.some(
                      (relation) => relation.type === option.type && relation.id === option.id,
                    )

                    return (
                      <label
                        key={`${option.type}-${option.id}`}
                        className="flex items-start gap-3 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleRelation(option.type, option.id, value === true)
                          }
                          disabled={!canEdit || isSaving}
                        />
                        <span>
                          <span className="block text-foreground">{option.label}</span>
                          {option.meta ? (
                            <span className="block text-muted-foreground">{option.meta}</span>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-[color:var(--accent)]">{error}</p> : null}

          <DialogFooter className="justify-between sm:justify-between">
            <div>
              {canEdit && form.taskId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void removeTask()}
                  disabled={isDeleting || isSaving}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving || isDeleting}
              >
                Cancel
              </Button>
              {canEdit ? (
                <Button
                  type="button"
                  onClick={() => void saveTask()}
                  disabled={isSaving || !form.title.trim()}
                >
                  {isSaving ? "Saving..." : form.taskId ? "Save task" : "Create task"}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

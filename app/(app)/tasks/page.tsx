import { MetricCard } from "@/components/metric-card"
import { TasksPageClient } from "@/components/tasks-page-client"
import { hasPermission, requirePermission } from "@/lib/auth"
import { getTasksRegisterData } from "@/lib/data"
import { getOrganizationUsers, type OrganizationUser } from "@/lib/workos"

export default async function TasksPage() {
  const viewer = await requirePermission("tasks:view")
  const { tasks, relatedOptions } = await getTasksRegisterData()

  let assignableUsers: OrganizationUser[] = []

  try {
    assignableUsers = await getOrganizationUsers(viewer.organizationId)
  } catch {
    const fallbackName =
      [viewer.user.firstName, viewer.user.lastName].filter(Boolean).join(" ").trim() ||
      viewer.user.email

    assignableUsers = [
      {
        userId: viewer.user.id,
        name: fallbackName,
        email: viewer.user.email,
        role: viewer.role,
      },
    ]
  }

  const linkedDecisionCount = tasks.filter((task) =>
    (task.related || []).some((relation) => relation.type === "decision"),
  ).length
  const linkedTimelineCount = tasks.filter((task) =>
    (task.related || []).some((relation) => relation.type === "milestone"),
  ).length

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Tasks
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Action register
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Track actions across the project with search and filters, assign work to
          project members, and optionally link each task back to a decision or a
          timeline milestone.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Tasks" value={String(tasks.length)} />
        <MetricCard label="Linked to decisions" value={String(linkedDecisionCount)} />
        <MetricCard label="Linked to timeline" value={String(linkedTimelineCount)} />
      </div>

      <TasksPageClient
        initialTasks={tasks}
        relatedOptions={relatedOptions}
        assignableUsers={assignableUsers}
        canEdit={hasPermission(viewer, "tasks:edit")}
      />
    </div>
  )
}

import "server-only"

import { unstable_cache } from "next/cache"
import { cache } from "react"
import { isLinearUploadUrl } from "@/lib/critical-path-utils"

// Read-only Linear client for The Critical Path page.
//
// Hand-rolled GraphQL over fetch rather than @linear/sdk: the SDK models relations as
// lazy Promises, so rendering N issues with state + assignee + labels fans out into
// hundreds of HTTP calls. Writing the query by hand is also what guarantees we never
// serialise a field we don't want on a publicly-shared page — see LinearViewIssue.
//
// IMPORTANT: nothing here throws. The page is public and must degrade, never 500.

const LINEAR_ENDPOINT = "https://api.linear.app/graphql"
const DEFAULT_PROJECT_NAMES = ["Architecture", "Room Designs"]
const DEFAULT_CACHE_SECONDS = 300
const ISSUES_PER_PAGE = 100
const MAX_PAGES = 5
const REQUEST_TIMEOUT_MS = 8000
const MAX_DESCRIPTION_CHARS = 20_000

export const LINEAR_CACHE_TAG = "linear:critical-path"

/** Linear's integer priority. Lower is more urgent — except 0, which means "none". */
export type LinearPriority = 0 | 1 | 2 | 3 | 4

export type LinearStateType =
  | "triage"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"

export type LinearViewState = {
  id: string
  name: string
  type: LinearStateType
  /** Workspace hex colour, so icons match the architect's real Linear. */
  color: string
  position: number
}

export type LinearViewLabel = {
  id: string
  name: string
  color: string
}

/** Deliberately no email — this is rendered to anonymous visitors. */
export type LinearViewAssignee = {
  key: string
  name: string
  avatarUrl: string | null
  initials: string
}

export type LinearViewAttachment = {
  id: string
  title: string
  subtitle: string | null
  url: string
  host: string | null
  /** uploads.linear.app files are private and must go through the asset proxy. */
  isLinearUpload: boolean
}

export type LinearViewMilestone = {
  id: string
  name: string
  targetDate: string | null
}

export type LinearViewIssue = {
  id: string
  identifier: string
  /** Which Linear project the issue came from — the page merges several. */
  project: { name: string }
  title: string
  description: string | null
  priority: LinearPriority
  priorityLabel: string
  dueDate: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  estimate: number | null
  state: LinearViewState
  assignee: LinearViewAssignee | null
  labels: LinearViewLabel[]
  milestone: LinearViewMilestone | null
  parent: { identifier: string; title: string } | null
  attachments: LinearViewAttachment[]
  /** Null for password-only visitors — the deep link leaks the workspace slug. */
  linearUrl: string | null
}

export type LinearViewProject = {
  name: string
  description: string | null
  state: string
  startDate: string | null
  targetDate: string | null
  progress: number
}

export type LinearFailureReason =
  | "not-configured"
  | "unauthorized"
  | "project-not-found"
  | "rate-limited"
  | "network"
  | "unknown"

export type LinearProjectResult =
  | {
      ok: true
      /** Every configured project that resolved, in configuration order. */
      projects: LinearViewProject[]
      /** Issues from all resolved projects, merged. */
      issues: LinearViewIssue[]
      fetchedAt: string
    }
  | { ok: false; reason: LinearFailureReason; message: string }

// --- raw response shapes (only what we select) -------------------------------------

type RawUser = {
  id: string
  name: string | null
  displayName: string | null
  avatarUrl: string | null
}

type RawIssue = {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number | null
  priorityLabel: string | null
  dueDate: string | null
  sortOrder: number | null
  url: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  estimate: number | null
  state: {
    id: string
    name: string
    type: string
    color: string
    position: number
  } | null
  assignee: RawUser | null
  labels: { nodes: Array<{ id: string; name: string; color: string }> } | null
  projectMilestone: { id: string; name: string; targetDate: string | null } | null
  parent: { id: string; identifier: string; title: string } | null
  attachments: {
    nodes: Array<{
      id: string
      title: string | null
      subtitle: string | null
      url: string
    }>
  } | null
}

type RawProject = {
  id: string
  name: string
  description: string | null
  state: string | null
  startDate: string | null
  targetDate: string | null
  progress: number | null
  issues: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    nodes: RawIssue[]
  }
}

type GraphQlResponse<T> = {
  data?: T
  errors?: Array<{ message: string; extensions?: { type?: string; code?: string } }>
}

/** Thrown internally so unstable_cache never persists a transient failure. */
class LinearRequestError extends Error {
  constructor(
    readonly reason: LinearFailureReason,
    readonly publicMessage: string,
    detail?: string,
  ) {
    super(detail || publicMessage)
  }
}

const PROJECT_QUERY = /* GraphQL */ `
  query CriticalPath($name: String!, $issueCount: Int!, $after: String) {
    projects(filter: { name: { eqIgnoreCase: $name } }, first: 1) {
      nodes {
        ...ProjectFields
      }
    }
  }

  fragment ProjectFields on Project {
    id
    name
    description
    state
    startDate
    targetDate
    progress
    issues(first: $issueCount, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        description
        priority
        priorityLabel
        dueDate
        sortOrder
        url
        createdAt
        updatedAt
        completedAt
        estimate
        state {
          id
          name
          type
          color
          position
        }
        assignee {
          id
          name
          displayName
          avatarUrl
        }
        labels(first: 6) {
          nodes {
            id
            name
            color
          }
        }
        projectMilestone {
          id
          name
          targetDate
        }
        parent {
          id
          identifier
          title
        }
        attachments(first: 10) {
          nodes {
            id
            title
            subtitle
            url
          }
        }
      }
    }
  }
`

/** Same document, but matching the project name loosely. Used as a fallback. */
const PROJECT_QUERY_FUZZY = PROJECT_QUERY.replace(
  "name: { eqIgnoreCase: $name }",
  "name: { containsIgnoreCase: $name }",
)

function getApiKey(): string | null {
  return process.env.LINEAR_API_KEY?.trim() || null
}

/**
 * Projects to pull, in display order. LINEAR_PROJECT_NAMES is comma-separated;
 * the singular LINEAR_PROJECT_NAME is still honoured for older deployments.
 */
export function getLinearProjectNames(): string[] {
  const configured =
    process.env.LINEAR_PROJECT_NAMES ?? process.env.LINEAR_PROJECT_NAME ?? ""
  const names = configured
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  return names.length ? [...new Set(names)] : DEFAULT_PROJECT_NAMES
}

function getCacheSeconds(): number {
  const parsed = Number(process.env.LINEAR_CACHE_SECONDS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CACHE_SECONDS
}

async function linearRequest<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response

  try {
    response = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: {
        // A personal API key goes in bare — no "Bearer " prefix.
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    throw new LinearRequestError(
      "network",
      "Couldn't reach Linear.",
      error instanceof Error ? error.message : undefined,
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new LinearRequestError("unauthorized", "Linear rejected the API key.")
  }

  if (response.status === 429) {
    throw new LinearRequestError("rate-limited", "Linear is rate limiting requests.")
  }

  if (!response.ok) {
    throw new LinearRequestError(
      "network",
      "Couldn't reach Linear.",
      `HTTP ${response.status}`,
    )
  }

  // Linear returns HTTP 200 with an errors[] body for most GraphQL failures.
  const payload = (await response.json().catch(() => null)) as GraphQlResponse<T> | null

  if (!payload) {
    throw new LinearRequestError("unknown", "Linear returned an unreadable response.")
  }

  if (payload.errors?.length) {
    const type = payload.errors[0]?.extensions?.type
    const detail = payload.errors.map((entry) => entry.message).join("; ")

    if (type === "authentication error" || type === "invalid input") {
      throw new LinearRequestError("unauthorized", "Linear rejected the API key.", detail)
    }
    if (type === "ratelimited") {
      throw new LinearRequestError("rate-limited", "Linear is rate limiting requests.", detail)
    }
    // Never surface a raw Linear error — it can carry workspace metadata.
    throw new LinearRequestError("unknown", "Linear returned an error.", detail)
  }

  if (!payload.data) {
    throw new LinearRequestError("unknown", "Linear returned an empty response.")
  }

  return payload.data
}

// --- mapping -----------------------------------------------------------------------

const STATE_TYPES: LinearStateType[] = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]

function toStateType(value: string | undefined): LinearStateType {
  return STATE_TYPES.includes(value as LinearStateType)
    ? (value as LinearStateType)
    : "backlog"
}

function toPriority(value: number | null): LinearPriority {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : 0
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function toHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * Maps a raw issue to the view model, enumerating every field explicitly.
 * Never spread the raw node here — the explicit list is the privacy boundary.
 */
function toViewIssue(raw: RawIssue, projectName: string): LinearViewIssue {
  const assigneeName = raw.assignee?.displayName || raw.assignee?.name || null
  const description = raw.description?.trim() || null

  return {
    id: raw.id,
    identifier: raw.identifier,
    project: { name: projectName },
    title: raw.title,
    description:
      description && description.length > MAX_DESCRIPTION_CHARS
        ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n\n…`
        : description,
    priority: toPriority(raw.priority),
    priorityLabel: raw.priorityLabel || "No priority",
    dueDate: raw.dueDate,
    sortOrder: raw.sortOrder ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    completedAt: raw.completedAt,
    estimate: raw.estimate,
    state: {
      id: raw.state?.id || "unknown",
      name: raw.state?.name || "Unknown",
      type: toStateType(raw.state?.type),
      color: raw.state?.color || "#94a3b8",
      position: raw.state?.position ?? 0,
    },
    assignee: raw.assignee
      ? {
          key: raw.assignee.id,
          name: assigneeName || "Unassigned",
          avatarUrl: raw.assignee.avatarUrl,
          initials: toInitials(assigneeName || "?"),
        }
      : null,
    labels: (raw.labels?.nodes || []).map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    })),
    milestone: raw.projectMilestone
      ? {
          id: raw.projectMilestone.id,
          name: raw.projectMilestone.name,
          targetDate: raw.projectMilestone.targetDate,
        }
      : null,
    parent: raw.parent
      ? { identifier: raw.parent.identifier, title: raw.parent.title }
      : null,
    attachments: (raw.attachments?.nodes || []).map((attachment) => ({
      id: attachment.id,
      title: attachment.title || toHost(attachment.url) || "Link",
      subtitle: attachment.subtitle,
      url: attachment.url,
      host: toHost(attachment.url),
      isLinearUpload: isLinearUploadUrl(attachment.url),
    })),
    linearUrl: raw.url,
  }
}

// --- fetching ----------------------------------------------------------------------

type FetchedProject = {
  project: LinearViewProject
  issues: LinearViewIssue[]
}

/** Resolves one project by name and pages through its issues. */
async function fetchOneProject(
  apiKey: string,
  projectName: string,
): Promise<FetchedProject> {
  type QueryData = { projects: { nodes: RawProject[] } }

  // Exact (case-insensitive) match first, then fall back to a contains match so a
  // project called "Architecture — Courtyard House" still resolves. Whichever document
  // matched has to be reused for pagination, or later pages resolve no project at all.
  let query = PROJECT_QUERY
  let data = await linearRequest<QueryData>(apiKey, query, {
    name: projectName,
    issueCount: ISSUES_PER_PAGE,
    after: null,
  })

  if (!data.projects.nodes.length) {
    query = PROJECT_QUERY_FUZZY
    data = await linearRequest<QueryData>(apiKey, query, {
      name: projectName,
      issueCount: ISSUES_PER_PAGE,
      after: null,
    })
  }

  const project = data.projects.nodes[0]

  if (!project) {
    // Thrown, not returned: a thrown result is never written to unstable_cache. If this
    // were cached, creating the project in Linear would appear to have no effect until
    // the TTL expired.
    throw new LinearRequestError(
      "project-not-found",
      `No Linear project named “${projectName}” was found.`,
    )
  }

  const rawIssues = [...project.issues.nodes]
  let pageInfo = project.issues.pageInfo
  let page = 1

  while (pageInfo.hasNextPage && pageInfo.endCursor && page < MAX_PAGES) {
    const next = await linearRequest<QueryData>(apiKey, query, {
      name: projectName,
      issueCount: ISSUES_PER_PAGE,
      after: pageInfo.endCursor,
    })
    const nextProject = next.projects.nodes[0]
    if (!nextProject) break

    rawIssues.push(...nextProject.issues.nodes)
    pageInfo = nextProject.issues.pageInfo
    page += 1
  }

  if (pageInfo.hasNextPage) {
    console.warn(
      `[linear] Stopped paginating "${projectName}" at ${rawIssues.length} issues (${MAX_PAGES}-page cap).`,
    )
  }

  return {
    project: {
      name: project.name,
      description: project.description,
      state: project.state || "unknown",
      startDate: project.startDate,
      targetDate: project.targetDate,
      progress: project.progress ?? 0,
    },
    issues: rawIssues.map((raw) => toViewIssue(raw, project.name)),
  }
}

/**
 * Fetches every configured project in parallel and merges their issues. A project
 * that doesn't exist is skipped with a warning so one renamed project doesn't blank
 * the page; only when none resolve is "project-not-found" surfaced.
 */
async function fetchLinearProjectsUncached(
  projectNames: string[],
): Promise<LinearProjectResult> {
  const apiKey = getApiKey()

  if (!apiKey) {
    throw new LinearRequestError("not-configured", "Linear is not connected.")
  }

  const settled = await Promise.all(
    projectNames.map(async (name) => {
      try {
        return await fetchOneProject(apiKey, name)
      } catch (error) {
        if (error instanceof LinearRequestError && error.reason === "project-not-found") {
          console.warn(`[linear] ${error.message}`)
          return null
        }
        throw error
      }
    }),
  )

  const found = settled.filter((entry): entry is FetchedProject => entry !== null)

  if (!found.length) {
    throw new LinearRequestError(
      "project-not-found",
      `No Linear project named ${projectNames.map((name) => `“${name}”`).join(" or ")} was found.`,
    )
  }

  // Dedupe by issue id in case one issue is somehow reachable from two projects.
  const seen = new Set<string>()
  const issues = found.flatMap((entry) =>
    entry.issues.filter((issue) => {
      if (seen.has(issue.id)) return false
      seen.add(issue.id)
      return true
    }),
  )

  return {
    ok: true,
    projects: found.map((entry) => entry.project),
    issues,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Cross-request cache. Linear's GraphQL API is POST-only and Next does not cache POST
 * fetches, so caching has to happen at the function level.
 *
 * unstable_cache is deprecated in favour of `use cache` in Next 16 but still functional.
 * fetchLinearProjectsUncached is kept separate so that swap stays a one-line change.
 */
function fetchLinearProjectsCached(projectNames: string[]) {
  return unstable_cache(
    () => fetchLinearProjectsUncached(projectNames),
    ["linear-critical-path", projectNames.join("|")],
    { revalidate: getCacheSeconds(), tags: [LINEAR_CACHE_TAG] },
  )()
}

export const getLinearCriticalPath = cache(
  async (): Promise<LinearProjectResult> => {
    const projectNames = getLinearProjectNames()

    if (!getApiKey()) {
      return {
        ok: false,
        reason: "not-configured",
        message: "Linear is not connected.",
      }
    }

    try {
      return await fetchLinearProjectsCached(projectNames)
    } catch (error) {
      // A thrown result is not written to the cache, so transient failures are not
      // pinned for the whole TTL.
      if (error instanceof LinearRequestError) {
        console.error(`[linear] ${error.reason}: ${error.message}`)
        return { ok: false, reason: error.reason, message: error.publicMessage }
      }

      console.error("[linear] unexpected failure", error)
      return {
        ok: false,
        reason: "unknown",
        message: "Couldn't load tasks from Linear.",
      }
    }
  },
)

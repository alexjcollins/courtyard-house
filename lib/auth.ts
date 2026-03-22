import "server-only"

import { withAuth, type NoUserInfo, type UserInfo } from "@workos-inc/authkit-nextjs"
import { NextResponse } from "next/server"
import { redirect } from "next/navigation"
import { cache } from "react"

export const APP_ROLES = ["admin", "architect"] as const
export type AppRole = (typeof APP_ROLES)[number]

export const APP_PERMISSIONS = [
  "dashboard:view",
  "categories:view",
  "decisions:view",
  "inspiration:view",
  "tasks:view",
  "timeline:view",
  "procurement:view",
  "funding:view",
  "admin:view",
  "tasks:edit",
  "decisions:edit",
  "ideas:edit",
  "inspiration:edit",
  "funding:edit",
  "admin:edit",
] as const

export type AppPermission = (typeof APP_PERMISSIONS)[number]

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: [...APP_PERMISSIONS],
  architect: [
    "dashboard:view",
    "categories:view",
    "decisions:view",
    "inspiration:view",
    "tasks:view",
    "tasks:edit",
    "timeline:view",
  ],
}

export type AuthViewer = {
  user: UserInfo["user"]
  sessionId: string
  organizationId: string
  role: AppRole
  roles: AppRole[]
  permissions: AppPermission[]
}

function isAppRole(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole)
}

function isAppPermission(value: string): value is AppPermission {
  return APP_PERMISSIONS.includes(value as AppPermission)
}

function getSafeRoleList(auth: UserInfo | NoUserInfo): AppRole[] {
  const rawRoles = [
    ...(auth.roles || []),
    ...(auth.role ? [auth.role] : []),
  ].filter(Boolean)

  return [...new Set(rawRoles.filter(isAppRole))]
}

function getPrimaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin"
  if (roles.includes("architect")) return "architect"
  return null
}

function toViewer(auth: UserInfo | NoUserInfo): AuthViewer | null {
  if (!auth.user || !auth.sessionId || !auth.organizationId) {
    return null
  }

  const roles = getSafeRoleList(auth)
  const role = getPrimaryRole(roles)

  if (!role) {
    return null
  }

  const permissions = [
    ...new Set([
      ...roles.flatMap((entry) => ROLE_PERMISSIONS[entry]),
      ...(auth.permissions || []).filter(isAppPermission),
    ]),
  ]

  return {
    user: auth.user,
    sessionId: auth.sessionId,
    organizationId: auth.organizationId,
    role,
    roles,
    permissions,
  }
}

const getOptionalAuth = cache(async () => withAuth())
const getRequiredAuth = cache(async () => withAuth({ ensureSignedIn: true }))

export function getSafeNextPath(nextRaw: unknown): string {
  const nextPath = typeof nextRaw === "string" ? nextRaw : "/"
  if (!nextPath.startsWith("/")) return "/"
  if (nextPath.startsWith("//")) return "/"
  if (nextPath.startsWith("/login")) return "/"
  if (nextPath.startsWith("/callback")) return "/"
  return nextPath
}

export async function getCurrentViewer(): Promise<AuthViewer | null> {
  return toViewer(await getOptionalAuth())
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getCurrentViewer())
}

export async function requireSession(): Promise<AuthViewer> {
  const viewer = toViewer(await getRequiredAuth())

  if (!viewer) {
    redirect("/unauthorized")
  }

  return viewer
}

export async function requireRole(
  role: AppRole | AppRole[],
): Promise<AuthViewer> {
  const viewer = await requireSession()
  const allowedRoles = Array.isArray(role) ? role : [role]

  if (!allowedRoles.includes(viewer.role)) {
    redirect("/unauthorized")
  }

  return viewer
}

export async function requirePermission(
  permission: AppPermission,
): Promise<AuthViewer> {
  const viewer = await requireSession()

  if (!viewer.permissions.includes(permission)) {
    redirect("/unauthorized")
  }

  return viewer
}

export function hasPermission(
  viewer: Pick<AuthViewer, "permissions">,
  permission: AppPermission,
): boolean {
  return viewer.permissions.includes(permission)
}

export function canViewCosts(viewer: Pick<AuthViewer, "role">): boolean {
  return viewer.role === "admin"
}

export async function authorizeApi(permission: AppPermission): Promise<
  | { viewer: AuthViewer; response?: undefined }
  | { viewer?: undefined; response: NextResponse }
> {
  const viewer = await getCurrentViewer()

  if (!viewer) {
    return {
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    }
  }

  if (!viewer.permissions.includes(permission)) {
    return {
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    }
  }

  return { viewer }
}

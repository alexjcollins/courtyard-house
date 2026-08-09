import "server-only"

import { getCurrentViewer, hasPermission } from "@/lib/auth"
import { hasPlanCookieAccess } from "@/lib/plan-access"

/**
 * Access check for the public /critical-path route and its API routes.
 *
 * Deliberately not authorizeApi(): a visitor holding the shared password has no WorkOS
 * session at all, but must still be able to refresh the list and load issue images.
 */
export async function hasCriticalPathAccess(): Promise<boolean> {
  const viewer = await getCurrentViewer()
  if (viewer && hasPermission(viewer, "critical-path:view")) return true
  return hasPlanCookieAccess()
}

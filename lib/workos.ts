import "server-only"

import { getWorkOS } from "@workos-inc/authkit-nextjs"

export type OrganizationUser = {
  userId: string
  name: string
  email: string
  role?: string
}

export async function getOrganizationUsers(
  organizationId: string,
): Promise<OrganizationUser[]> {
  const workos = getWorkOS()
  const [membershipsPage, usersPage] = await Promise.all([
    workos.userManagement.listOrganizationMemberships({
      organizationId,
      statuses: ["active", "pending"],
      limit: 100,
    }),
    workos.userManagement.listUsers({
      limit: 100,
    }),
  ])

  const [memberships, users] = await Promise.all([
    membershipsPage.autoPagination(),
    usersPage.autoPagination(),
  ])

  const userMap = new Map(users.map((user) => [user.id, user]))
  const organizationUsers = memberships.map((membership): OrganizationUser | null => {
    const user = userMap.get(membership.userId)
    if (!user) {
      return null
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()

    return {
      userId: user.id,
      name: name || user.email,
      email: user.email,
      role: membership.role?.slug,
    }
  })

  return organizationUsers
    .filter((user): user is OrganizationUser => Boolean(user))
    .sort((left, right) => left.name.localeCompare(right.name))
}

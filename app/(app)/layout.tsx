import Link from "next/link"
import { signOut } from "@workos-inc/authkit-nextjs"
import { getProjectData } from "@/lib/data"
import { ProjectNav, type ProjectNavItem } from "@/components/project-nav"
import { hasPermission, requireSession } from "@/lib/auth"

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const viewer = await requireSession()
  const data = await getProjectData()
  const allNavigationItems = [
    { href: "/", label: "Dashboard" },
    { href: "/categories", label: "Categories" },
    { href: "/procurement", label: "Procurement" },
    { href: "/decisions", label: "Decisions" },
    { href: "/tasks", label: "Tasks" },
    { href: "/inspiration", label: "Inspiration" },
    { href: "/funding", label: "Funding" },
    { href: "/timeline", label: "Timeline" },
  ] satisfies ProjectNavItem[]
  const navigationItems = allNavigationItems.filter((item) => {
    const permissionMap = {
      "/": "dashboard:view",
      "/categories": "categories:view",
      "/procurement": "procurement:view",
      "/decisions": "decisions:view",
      "/tasks": "tasks:view",
      "/inspiration": "inspiration:view",
      "/funding": "funding:view",
      "/timeline": "timeline:view",
    } as const

    return hasPermission(viewer, permissionMap[item.href as keyof typeof permissionMap])
  })

  return (
    <div className="min-h-screen p-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-[2000px] flex-col border-x border-border/80 py-6">
        <header className="border-b border-border/80 pb-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <Link href="/" className="text-4xl font-medium tracking-tight text-foreground">
                    {data.project.name}
                  </Link>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {data.project.location}
                  </p>
                </div>
              </div>
            </div>

            <form
              action={async () => {
                "use server"
                await signOut()
              }}
            >
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Log out
              </button>
            </form>
          </div>

          <div className="mt-6">
            <ProjectNav
              items={navigationItems}
              showAdmin={hasPermission(viewer, "admin:view")}
            />
          </div>
        </header>

        <main className="flex-1 py-8">{children}</main>
      </div>
    </div>
  )
}

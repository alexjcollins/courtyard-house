import Link from "next/link"
import { requireAuth } from "@/lib/auth"
import { getProjectData } from "@/lib/data"
import { ProjectNav } from "@/components/project-nav"

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireAuth()
  const data = await getProjectData()

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

            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Log out
              </button>
            </form>
          </div>

          <div className="mt-6">
            <ProjectNav />
          </div>
        </header>

        <main className="flex-1 py-8">{children}</main>
      </div>
    </div>
  )
}

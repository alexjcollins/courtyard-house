import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { getCurrentViewer, getSafeNextPath } from "@/lib/auth"

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string
    error?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) || {}
  const nextPath = getSafeNextPath(params.next)
  const viewer = await getCurrentViewer()

  if (viewer) {
    redirect(nextPath)
  }

  const auth = await withAuth()
  if (auth.user) {
    redirect("/unauthorized")
  }

  const signInUrl = await getSignInUrl({
    returnTo: nextPath,
  })

  return (
    <div className="min-h-screen p-10">
      <main className="mx-auto min-h-[calc(100vh-80px)] max-w-[2000px] border-x border-border/80 px-10 py-8">
        <div className="grid min-h-[calc(100vh-144px)] items-end gap-10 md:grid-cols-[1.2fr_0.8fr]">
          <section className="pb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Project Management
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl font-medium tracking-tight text-foreground md:text-7xl">
              Courtyard House build management platform.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Sign in with your invited Google account to access the project workspace.
            </p>
          </section>

          <section className="border border-border/80 bg-card/80 p-6 backdrop-blur-sm">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Sign in
                </p>
                <h2 className="mt-3 text-3xl font-medium tracking-tight">
                  Google via WorkOS
                </h2>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                Access is invite-only. Roles and section visibility are managed through your WorkOS organization membership.
              </p>

              <a
                href={signInUrl}
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:bg-foreground/90"
              >
                Sign in with Google
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

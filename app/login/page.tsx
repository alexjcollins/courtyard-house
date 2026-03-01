import { redirect } from "next/navigation"
import { isAuthenticated, getSafeNextPath } from "@/lib/auth"

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string
    error?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) || {}
  const nextPath = getSafeNextPath(params.next)
  const hasError = params.error === "1"

  if (await isAuthenticated()) {
    redirect(nextPath)
  }

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
              Enter your password to access the platform to work on timelines, budgets, and procurement.
            </p>
          </section>

          <section className="border border-border/80 bg-card/80 p-6 backdrop-blur-sm">
            <form action="/api/auth" method="post" className="space-y-6">
              <input type="hidden" name="next" value={nextPath} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Sign in
                </p>
                <h2 className="mt-3 text-3xl font-medium tracking-tight">
                  Shared password access
                </h2>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoFocus
                  className="h-14 w-full rounded-2xl border border-border/80 bg-white/80 px-4 text-lg outline-none transition focus:border-foreground"
                />
              </div>

              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="remember"
                  value="1"
                  className="size-4 rounded border border-border accent-[color:var(--accent)]"
                />
                Remember me for 30 days
              </label>

              {hasError ? (
                <p className="text-sm text-[color:var(--accent)]">Incorrect password.</p>
              ) : null}

              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:bg-foreground/90"
              >
                Enter project
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}

import Link from "next/link"
import { signOut } from "@workos-inc/authkit-nextjs"

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen p-10">
      <main className="mx-auto min-h-[calc(100vh-80px)] max-w-[2000px] border-x border-border/80 px-10 py-8">
        <div className="flex min-h-[calc(100vh-144px)] items-end">
          <section className="max-w-2xl pb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Access
            </p>
            <h1 className="mt-4 text-5xl font-medium tracking-tight text-foreground md:text-7xl">
              You do not have access to that part of the project.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
              Ask an admin to update your WorkOS organization role if you need access.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition hover:bg-foreground/90"
              >
                Return to dashboard
              </Link>
              <form
                action={async () => {
                  "use server"
                  await signOut()
                }}
              >
                <button
                  type="submit"
                  className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Log out
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

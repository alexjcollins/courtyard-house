import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen p-10">
      <main className="mx-auto min-h-[calc(100vh-80px)] max-w-[2000px] border-x border-border/80 px-10 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Not found
        </p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          That route does not exist.
        </h1>
        <Link href="/" className="mt-6 inline-flex text-sm text-muted-foreground hover:text-foreground">
          Return to dashboard
        </Link>
      </main>
    </div>
  )
}

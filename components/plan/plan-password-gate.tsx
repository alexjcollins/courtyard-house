"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function PlanPasswordGate({
  passwordConfigured,
}: {
  passwordConfigured: boolean
}) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!password.trim() || isSubmitting) return

    setError(null)
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/plan/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error || "Incorrect password.")
        return
      }

      startTransition(() => router.refresh())
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Courtyard House
        </p>
        <h1 className="mt-3 text-2xl font-medium">House plan</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {passwordConfigured
            ? "Enter the access password to view the plan."
            : "Public access has not been configured for this plan."}
        </p>

        {passwordConfigured ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoFocus
              aria-label="Plan access password"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || isPending || !password.trim()}
            >
              {isSubmitting || isPending ? "Checking…" : "View plan"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  )
}

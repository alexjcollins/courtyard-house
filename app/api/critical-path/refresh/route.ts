import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import { hasCriticalPathAccess } from "@/lib/critical-path-access"
import { LINEAR_CACHE_TAG } from "@/lib/linear"

// Drops the cached Linear response so the next render refetches.
// Gated on session-or-shared-password rather than authorizeApi, because a
// password-only visitor legitimately needs to refresh.
export async function POST() {
  if (!(await hasCriticalPathAccess())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    // Next 16 requires a staleness profile. { expire: 0 } means "accept nothing older
    // than now", i.e. an immediate purge. (updateTag would be the other option, but it
    // throws outside a Server Action.)
    revalidateTag(LINEAR_CACHE_TAG, { expire: 0 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not refresh tasks.",
      },
      { status: 400 },
    )
  }
}

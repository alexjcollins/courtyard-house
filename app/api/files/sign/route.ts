import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import {
  createPrivateObjectSignedUrl,
  getStorageStatus,
  normalizePrivateObjectKey,
} from "@/lib/storage"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      key?: string
      action?: "download" | "upload"
      expiresInSeconds?: number
    }

    const storage = getStorageStatus()
    if (storage.backend !== "spaces") {
      return NextResponse.json(
        { error: "Private signed URLs require Spaces storage." },
        { status: 400 },
      )
    }

    const key = normalizePrivateObjectKey(body.key || "")
    if (!key.startsWith("files/") && !key.startsWith("data/")) {
      return NextResponse.json(
        { error: "Signed URL keys must live under files/ or data/." },
        { status: 400 },
      )
    }

    const expiresInSeconds = Math.min(
      Math.max(Math.floor(body.expiresInSeconds || storage.signedUrlTtlSeconds), 60),
      60 * 60,
    )

    return NextResponse.json({
      key,
      action: body.action === "upload" ? "upload" : "download",
      expiresInSeconds,
      url: createPrivateObjectSignedUrl(key, {
        action: body.action === "upload" ? "upload" : "download",
        expiresInSeconds,
      }),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create signed URL.",
      },
      { status: 400 },
    )
  }
}

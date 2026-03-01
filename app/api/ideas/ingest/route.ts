import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { ingestIdeaUrl } from "@/lib/ideas"
import { createPrivateObjectSignedUrl } from "@/lib/storage"

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      sourceUrl?: string
      draftId?: string
    }

    if (!body.sourceUrl) {
      return NextResponse.json({ error: "Source URL is required." }, { status: 400 })
    }

    const draftId = body.draftId || `ingest-${Date.now()}`
    const result = await ingestIdeaUrl(draftId, body.sourceUrl)
    return NextResponse.json({
      idea: {
        ...result,
        images: result.images.map((image) => ({
          ...image,
          signedUrl: createPrivateObjectSignedUrl(image.key, {
            expiresInSeconds: 60 * 60,
          }),
        })),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not ingest item URL.",
      },
      { status: 400 },
    )
  }
}

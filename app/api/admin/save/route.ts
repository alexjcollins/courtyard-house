import { NextResponse } from "next/server"
import { authorizeApi } from "@/lib/auth"
import { DATA_FILE_NAMES, type DataFileName, saveEditableFile } from "@/lib/data"

export async function POST(request: Request) {
  const auth = await authorizeApi("admin:edit")
  if (auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      fileName?: string
      content?: string
    }

    if (
      !body.fileName ||
      !DATA_FILE_NAMES.includes(body.fileName as DataFileName) ||
      typeof body.content !== "string"
    ) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 })
    }

    await saveEditableFile(body.fileName as DataFileName, body.content)
    return NextResponse.json({
      ok: true,
      content: `${JSON.stringify(JSON.parse(body.content), null, 2)}\n`,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save file.",
      },
      { status: 400 },
    )
  }
}

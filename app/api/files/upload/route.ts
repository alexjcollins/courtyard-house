import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import {
  createPrivateObjectSignedUrl,
  normalizePrivateObjectKey,
  writePrivateObject,
} from "@/lib/storage"

function extensionForUpload(file: File): string {
  const fileNameExtension = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")

  if (fileNameExtension) {
    return fileNameExtension
  }

  const type = file.type.toLowerCase()
  if (type.includes("jpeg")) return "jpg"
  if (type.includes("png")) return "png"
  if (type.includes("webp")) return "webp"
  if (type.includes("gif")) return "gif"
  if (type.includes("svg")) return "svg"

  return "jpg"
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const rawFolder = String(formData.get("folder") || "files/uploads").trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 })
    }

    if (!file.type.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 })
    }

    const folder = normalizePrivateObjectKey(rawFolder.replace(/\/+$/, ""))
    if (!folder.startsWith("files/")) {
      return NextResponse.json(
        { error: "Uploads must target a folder under files/." },
        { status: 400 },
      )
    }

    const key = `${folder}/${randomUUID()}.${extensionForUpload(file)}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    await writePrivateObject(key, bytes, file.type || "application/octet-stream")

    return NextResponse.json({
      image: {
        key,
        alt: file.name,
        signedUrl: createPrivateObjectSignedUrl(key, {
          expiresInSeconds: 60 * 60,
        }),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not upload image.",
      },
      { status: 400 },
    )
  }
}

import { hasCriticalPathAccess } from "@/lib/critical-path-access"

// Streams private Linear uploads (pasted screenshots in issue descriptions), which
// 403 for anyone without Linear credentials.
//
// GET rather than the house POST convention because this serves image bytes to <img>.
//
// SECURITY: this attaches our Linear API key to the outbound request, so the host
// allowlist below is what stops it being an open SSRF proxy. The check is exact
// equality on purpose — an endsWith or includes test is defeated by a hostname like
// evil.uploads.linear.app.attacker.com.
const ALLOWED_HOST = "uploads.linear.app"

export async function GET(request: Request) {
  if (!(await hasCriticalPathAccess())) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiKey = process.env.LINEAR_API_KEY?.trim()
  if (!apiKey) {
    return new Response("Not configured", { status: 503 })
  }

  const rawUrl = new URL(request.url).searchParams.get("url")
  if (!rawUrl) {
    return new Response("Missing url", { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return new Response("Invalid url", { status: 400 })
  }

  if (target.protocol !== "https:" || target.hostname !== ALLOWED_HOST) {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const upstream = await fetch(target, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "follow",
    })

    if (!upstream.ok || !upstream.body) {
      return new Response("Not found", { status: 404 })
    }

    return new Response(upstream.body, {
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/octet-stream",
        "cache-control": "private, max-age=3600",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    })
  } catch {
    return new Response("Upstream error", { status: 502 })
  }
}

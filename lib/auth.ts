import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export const AUTH_COOKIE_NAME = "selfbuild_session"
export const AUTH_COOKIE_TTL_SECONDS = 60 * 60 * 12
export const AUTH_COOKIE_REMEMBER_TTL_SECONDS = 60 * 60 * 24 * 30

function getAuthSecret(): string {
  return process.env.SELFBUILD_AUTH_SECRET || "change-this-auth-secret"
}

export function getSharedPassword(): string {
  return process.env.SELFBUILD_PASSWORD || "courtyard-house"
}

function signTokenPayload(payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url")
}

export function createAuthToken(remember = false, now = Date.now()): string {
  const ttl = remember
    ? AUTH_COOKIE_REMEMBER_TTL_SECONDS
    : AUTH_COOKIE_TTL_SECONDS
  const expiresAt = Math.floor(now / 1000) + ttl
  const payload = `${expiresAt}:${remember ? 1 : 0}`
  return `${payload}.${signTokenPayload(payload)}`
}

export function verifyAuthToken(token: string | null | undefined): boolean {
  if (!token) return false

  const parts = token.split(".")
  if (parts.length !== 2) return false

  const [payload, providedSignature] = parts
  if (!payload || !providedSignature) return false

  const [expiresAtRaw] = payload.split(":")
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false
  }

  const expectedSignature = signTokenPayload(payload)
  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}

export function getSafeNextPath(nextRaw: unknown): string {
  const nextPath = typeof nextRaw === "string" ? nextRaw : "/"
  if (!nextPath.startsWith("/")) return "/"
  if (nextPath.startsWith("//")) return "/"
  if (nextPath.startsWith("/login")) return "/"
  return nextPath
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return verifyAuthToken(cookieStore.get(AUTH_COOKIE_NAME)?.value)
}

export async function requireAuth(nextPath = "/"): Promise<void> {
  if (await isAuthenticated()) return
  redirect(`/login?next=${encodeURIComponent(getSafeNextPath(nextPath))}`)
}

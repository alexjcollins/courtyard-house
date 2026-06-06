import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

export const PLAN_COOKIE = "plan_access"
const TOKEN_PAYLOAD = "plan-access-v1"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

/** Constant-time string comparison (length-independent via fixed-size hashing). */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b))
}

function getAccessSecret(): string {
  const secret =
    process.env.PLAN_ACCESS_SECRET?.trim() ||
    process.env.WORKOS_COOKIE_PASSWORD?.trim()

  if (!secret) {
    throw new Error(
      "Plan access secret is required. Set PLAN_ACCESS_SECRET or WORKOS_COOKIE_PASSWORD.",
    )
  }

  return secret
}

/** True when a shared password has been configured for public access. */
export function isPlanPasswordConfigured(): boolean {
  return Boolean(process.env.PLAN_PUBLIC_PASSWORD?.trim())
}

export function verifyPlanPassword(input: unknown): boolean {
  const expected = process.env.PLAN_PUBLIC_PASSWORD?.trim()
  if (!expected) return false
  if (typeof input !== "string" || input.length === 0) return false
  return safeEqual(input, expected)
}

export function createPlanAccessToken(): string {
  return createHmac("sha256", getAccessSecret())
    .update(TOKEN_PAYLOAD)
    .digest("hex")
}

export function verifyPlanAccessToken(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    return safeEqual(value, createPlanAccessToken())
  } catch {
    return false
  }
}

/** Reads the request cookie and returns whether the visitor has unlocked the plan. */
export async function hasPlanCookieAccess(): Promise<boolean> {
  const store = await cookies()
  return verifyPlanAccessToken(store.get(PLAN_COOKIE)?.value)
}

export const planAccessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE_SECONDS,
}

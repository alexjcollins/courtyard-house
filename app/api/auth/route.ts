import { NextResponse } from "next/server"
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_REMEMBER_TTL_SECONDS,
  AUTH_COOKIE_TTL_SECONDS,
  createAuthToken,
  getSafeNextPath,
  getSharedPassword,
} from "@/lib/auth"

export async function POST(request: Request) {
  const formData = await request.formData()
  const password = String(formData.get("password") || "")
  const remember = String(formData.get("remember") || "") === "1"
  const nextPath = getSafeNextPath(formData.get("next"))
  const requestUrl = new URL(request.url)

  if (password !== getSharedPassword()) {
    const loginUrl = new URL("/login", requestUrl)
    loginUrl.searchParams.set("error", "1")
    loginUrl.searchParams.set("next", nextPath)
    const response = NextResponse.redirect(loginUrl, { status: 303 })
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
    return response
  }

  const response = NextResponse.redirect(new URL(nextPath, requestUrl), {
    status: 303,
  })

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createAuthToken(remember),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? AUTH_COOKIE_REMEMBER_TTL_SECONDS : AUTH_COOKIE_TTL_SECONDS,
  })

  return response
}

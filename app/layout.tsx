import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import localFont from "next/font/local"
import "./globals.css"

const groteskPlus = localFont({
  src: "../public/fonts/GroteskPlusVariable.woff2",
  variable: "--font-grotesk-plus",
  weight: "100 900",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Courtyard House",
  description: "Private self-build project manager for a single house build.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${groteskPlus.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}

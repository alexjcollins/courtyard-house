"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, FolderKanban, ShoppingCart, GitBranch, Settings2, Wallet, Images } from "lucide-react"
import { cn } from "@/lib/utils"

const iconMap = {
  "/": Home,
  "/categories": FolderKanban,
  "/procurement": ShoppingCart,
  "/decisions": Settings2,
  "/inspiration": Images,
  "/funding": Wallet,
  "/timeline": GitBranch,
} as const

export type ProjectNavItem = {
  href: keyof typeof iconMap
  label: string
}

type ProjectNavProps = {
  items: ProjectNavItem[]
  showAdmin: boolean
}

export function ProjectNav({ items, showAdmin }: ProjectNavProps) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = iconMap[item.href]
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors",
              isActive
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        )
      })}

      {showAdmin ? (
        <Link
          href="/admin"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors",
            pathname.startsWith("/admin")
              ? "bg-[color:var(--accent)] text-black"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <span>Admin JSON</span>
        </Link>
      ) : null}
    </nav>
  )
}

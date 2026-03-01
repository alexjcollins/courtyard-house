"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, FolderKanban, ShoppingCart, GitBranch, Settings2, Wallet, Images } from "lucide-react"
import { cn } from "@/lib/utils"

const navigationItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/categories", label: "Categories", icon: FolderKanban },
  { href: "/procurement", label: "Procurement", icon: ShoppingCart },
  { href: "/decisions", label: "Decisions", icon: Settings2 },
  { href: "/inspiration", label: "Inspiration", icon: Images },
  { href: "/funding", label: "Funding", icon: Wallet },
  { href: "/timeline", label: "Timeline", icon: GitBranch },
] as const

export function ProjectNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-2">
      {navigationItems.map((item) => {
        const Icon = item.icon
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
    </nav>
  )
}

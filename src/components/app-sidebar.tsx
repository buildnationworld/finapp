"use client";

import {
  Bot,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTree,
  LogOut,
  ScrollText,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: Inbox },
  { href: "/transactions", label: "Transactions", icon: ListTree },
  { href: "/copilot", label: "Copilot", icon: Bot },
  { href: "/insights", label: "Insights", icon: TrendingUp },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/audit", label: "Audit log", icon: ScrollText },
] as const;

export function AppSidebar({ user }: { user: { email?: string | null; name?: string | null } }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl md:flex">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-border/60">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">PesaPilot AI</span>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 scrollbar-thin overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/60 p-3">
        <div className="mb-2 flex items-center gap-2 rounded-md bg-secondary/60 px-2 py-2 text-xs">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <div className="flex-1 truncate">
            <div className="truncate font-medium text-foreground">
              {user.name ?? user.email ?? "User"}
            </div>
            <div className="truncate text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}

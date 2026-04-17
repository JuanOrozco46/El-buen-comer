"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ChefHat,
  Home,
  User,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSession } from "next-auth/react";

const NAV_ITEMS = [
  { icon: Home, label: "Home", href: "/", roles: ["ADMIN"] },
  { icon: LayoutGrid, label: "POS", href: "/pos", roles: ["ADMIN", "CASHIER", "WAITER"] },
  { icon: ChefHat, label: "Cocina", href: "/kitchen", roles: ["ADMIN", "CHEF"] },
  // Adding a Profile/Logout link for mobile since the sidebar is hidden
  { icon: User, label: "Perfil", href: "/admin/settings", roles: ["ADMIN"] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") return null;

  const currentRole = session?.user?.role || "WAITER";
  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole as string));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 py-3 flex justify-between items-center z-[100] safe-area-inset-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {visibleNavItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 transition-all duration-300",
              isActive ? "text-orange-600" : "text-zinc-400"
            )}
          >
            <div className={cn(
              "p-2 rounded-xl transition-all",
              isActive ? "bg-orange-600/10" : ""
            )}>
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-[60px]">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

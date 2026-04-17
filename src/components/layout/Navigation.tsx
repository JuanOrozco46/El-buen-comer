"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ChefHat,
  Package,
  Settings,
  Flame,
  Home,
  LogOut,
  MapPin,
  Utensils
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSession, signOut } from "next-auth/react";

const NAV_ITEMS = [
  { icon: Home, label: "Dashboard", href: "/", roles: ["ADMIN"] },
  { icon: LayoutGrid, label: "Pedidos", href: "/pos", roles: ["ADMIN", "CASHIER", "WAITER"] },
  // { icon: MapPin, label: "Mesas", href: "/tables", roles: ["ADMIN", "WAITER", "CASHIER"] }, // Future expansion
  { icon: ChefHat, label: "Cocina", href: "/kitchen", roles: ["ADMIN", "CHEF"] },
  { icon: Package, label: "Inventario", href: "/admin/inventory", roles: ["ADMIN"] },
  { icon: Utensils, label: "Menú", href: "/admin/menu", roles: ["ADMIN"] },
  { icon: Settings, label: "Ajustes", href: "/admin/settings", roles: ["ADMIN"] },
];

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") return null;

  const currentRole = session?.user?.role || "WAITER";
  const visibleNavItems = NAV_ITEMS.filter(item => item.roles.includes(currentRole as string));

  return (
    <aside className="hidden md:flex w-24 flex-col items-center py-8 gap-10 bg-white border-r border-zinc-200 z-50 shrink-0">
      <Link href="/" className="w-14 h-14 bg-orange-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-orange-600/30 hover:scale-105 transition-transform pointer-events-none md:pointer-events-auto">
        <Flame size={32} />
      </Link>

      <nav className="flex flex-col gap-8 flex-1">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex flex-col items-center gap-1 p-3 rounded-2xl transition-all duration-300",
                isActive
                  ? "bg-orange-50 text-orange-600 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50"
              )}
            >
              <item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest mt-1 text-center leading-tight",
                isActive ? "opacity-100 text-orange-600" : "opacity-60 group-hover:opacity-100 transition-opacity"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-orange-600 rounded-r-full" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 items-center">
        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-bold border border-zinc-200">
          {session?.user?.name?.charAt(0) || "U"}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
          title="Cerrar Sesión"
        >
          <LogOut size={24} />
        </button>
      </div>
    </aside>
  );
}

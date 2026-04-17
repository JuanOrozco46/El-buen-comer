"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Utensils,
  Package,
  Beaker,
  Settings,
  LogOut,
  Flame,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Carta", href: "/admin/menu", icon: Utensils },
  { label: "Inventario", href: "/admin/inventory", icon: Package },
  { label: "Recetas", href: "/admin/recipes", icon: Beaker },
  { label: "Ajustes", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-72 bg-zinc-950 text-white flex flex-col shrink-0 border-r border-zinc-800">
      {/* Brand */}
      <div className="p-8 border-b border-zinc-800/50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-600/30">
            <Flame size={24} />
          </div>
          <div>
            <h2 className="font-black text-lg tracking-tight leading-none">El buen comer</h2>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] mt-1">Panel Administrativo</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group ${
                active
                  ? "bg-orange-600/10 text-orange-500 border border-orange-500/20"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-900 border border-transparent"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className="text-xs font-black uppercase tracking-[0.15em] flex-1">{item.label}</span>
              {active && <ChevronRight size={14} className="text-orange-500/50" />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-zinc-800/50">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-4 w-full px-5 py-4 rounded-2xl text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-all border border-transparent hover:border-red-500/10"
        >
          <LogOut size={20} />
          <span className="text-xs font-black uppercase tracking-[0.15em]">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}

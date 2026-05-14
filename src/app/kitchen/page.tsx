"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FullOrder } from "../../types";
import { ChefHat, Info, AlertTriangle } from "lucide-react";

export default function KitchenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [isPanicActive, setIsPanicActive] = useState(false);

  // Auth guard — redirect if not authorized
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated" && !["CHEF", "ADMIN"].includes(session.user.role || "")) {
      router.push("/pos");
    }
  }, [status, session, router]);

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/orders?status=active");
      if (res.ok) {
        const data: FullOrder[] = await res.json();
        setOrders(data);
      }
      // Fetch Panic Status
      const panicRes = await fetch("/api/admin/panic");
      if (panicRes.ok) {
        const panicData = await panicRes.json();
        setIsPanicActive(panicData.isPanicModeActive);
      }
    } catch (error) {
      console.error("Error fetching kitchen data:", error);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000); // Poll every 3s
    return () => clearInterval(interval);
  }, [status]);

  // Filter out PAID orders. Kitchen only sees active orders.
  const activeOrders = orders.filter(
    (o) => o.status !== "PAID" && o.status !== "CANCELLED",
  );

  return (
    <div className="flex h-screen bg-zinc-900 overflow-hidden font-sans text-white">
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 lg:h-24 flex items-center justify-between px-4 md:px-10 bg-zinc-950 border-b border-zinc-800">
          <div>
            <h1 className="text-xl md:text-3xl font-black text-white tracking-tight uppercase">
              Monitor de Preparación
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse"></span>
              <p className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                En Línea • Solo Lectura
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {isPanicActive && (
              <div className="flex items-center gap-3 bg-red-600/20 border border-red-600 px-6 py-3 rounded-2xl animate-pulse">
                <AlertTriangle className="text-red-500" size={20} />
                <span className="text-red-500 font-black uppercase tracking-widest text-[10px]">Modo Pánico Activo: Pausa de Pedidos</span>
              </div>
            )}

            <div className="text-right">
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                Tickets Activos
              </p>
              <p className="text-3xl font-black text-white">
                {activeOrders.length}
              </p>
            </div>
          </div>
        </header>

        {/* Orders Grid */}
        <section className="flex-1 overflow-y-auto p-4 md:p-10 bg-zinc-900 custom-scrollbar">
          {activeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <ChefHat size={120} className="opacity-20 mb-8" />
              <p className="text-3xl font-black tracking-tight text-zinc-500">
                Sin comandas pendientes
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 content-start">
              {activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-zinc-800 rounded-[28px] border border-zinc-700 overflow-hidden shadow-2xl flex flex-col"
                >
                  {/* Ticket Header */}
                  <div className="px-6 py-4 bg-zinc-800 border-b border-zinc-700 flex justify-between items-center">
                    <div>
                      <h2 className="text-2xl font-black text-white">
                        #{order.id}
                      </h2>
                      {order.table && (
                        <p className="text-[10px] font-black uppercase text-orange-500 tracking-[0.2em] mt-0.5">Mesa {order.table.number}</p>
                      )}
                    </div>
                    <span className="text-zinc-400 font-mono font-bold text-sm tracking-widest">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Items List */}
                  <ul className="flex-1 p-6 space-y-4">
                    {order.items.map((item: any) => (
                      <li key={item.id} className="flex gap-4 items-start">
                        <span className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black shrink-0">
                          {item.quantity}
                        </span>
                        <div className="flex flex-col mt-1">
                          <span className="font-bold text-lg text-zinc-100 leading-snug">
                            {item.product.name}
                          </span>
                          <span className="text-xs font-black text-orange-400 uppercase tracking-widest mt-1">
                            Tamaño: {item.sizeName}
                          </span>
                          {item.notes && (
                            <div className="mt-2 p-2 bg-zinc-900 border-l-4 border-orange-600 rounded-r-lg">
                              <p className="text-xs font-black text-orange-50 uppercase tracking-widest mb-0.5">Instrucción:</p>
                              <p className="text-sm font-bold text-white italic">{item.notes}</p>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Footer Context */}
                  <div className="px-6 py-4 bg-zinc-950 flex flex-col gap-2 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                        <Info size={14} /> {order.source}
                      </p>
                      <p className="text-sm font-black text-zinc-400">
                        {order.customerName ? order.customerName : "Mostrador"}
                      </p>
                    </div>
                    {order.notes && (
                      <div className="mt-1 p-2 bg-orange-600/20 border border-orange-600/40 rounded-xl">
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">{order.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { 
  ShoppingBag, 
  Banknote, 
  Smartphone, 
  User, 
  Calendar, 
  Search, 
  Loader2,
  TrendingUp,
  Clock,
  ArrowRight
} from "lucide-react";
import { FullOrder } from "../../types";
import Link from "next/link";

export default function AdminDashboard() {
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(new Date().toISOString().split("T")[0]);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders?from=${from}&to=${to}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const totalSales = orders.reduce((s,o) => s + Number(o.total), 0);
  const totalCash = orders.reduce((s,o) => s + (o.payments?.reduce((ps, p) => p.method === 'CASH' ? ps + Number(p.amount) : ps, 0) || 0), 0);
  const totalTransfer = orders.reduce((s,o) => s + (o.payments?.reduce((ps, p) => p.method === 'TRANSFER' ? ps + Number(p.amount) : ps, 0) || 0), 0);

  const waiterTotals = orders.reduce((acc: any, order) => {
    const name = order.user?.name || "Sistema";
    acc[name] = (acc[name] || 0) + Number(order.total);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-50/50 text-zinc-900 p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <p className="text-orange-600 font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 bg-orange-600 rounded-full animate-pulse" />
            Panel de Control Real
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-zinc-950">
            Mi <span className="text-orange-600">Dashboard</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[24px] border border-zinc-100 shadow-sm w-full md:w-auto">
          <div className="flex items-center gap-2">
             <Calendar size={16} className="text-zinc-400 ml-2" />
             <input 
                type="date" 
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-zinc-700 focus:ring-0 cursor-pointer"
             />
             <span className="text-zinc-300 font-bold">→</span>
             <input 
                type="date" 
                value={to}
                onChange={e => setTo(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-zinc-700 focus:ring-0 cursor-pointer"
             />
          </div>
          <button 
             onClick={fetchDashboardData}
             className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-2 shadow-lg shadow-zinc-900/10"
          >
             <Search size={14} />
             Actualizar
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-zinc-400 gap-4">
          <Loader2 size={48} className="animate-spin text-orange-600" />
          <p className="font-black uppercase tracking-[0.3em] text-[10px]">Consultando Ventas Real-Time...</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Main Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[32px] border border-zinc-100 shadow-sm hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mb-4">
                <ShoppingBag size={24} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Total Órdenes</p>
              <p className="text-3xl font-black text-zinc-950">{orders.length}</p>
            </div>
            
            <div className="bg-zinc-900 p-6 rounded-[32px] shadow-xl shadow-zinc-900/10">
              <div className="w-12 h-12 bg-zinc-800 text-orange-500 rounded-2xl flex items-center justify-center mb-4">
                <TrendingUp size={24} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Ventas Totales</p>
              <p className="text-3xl font-black text-white">${totalSales.toLocaleString()}</p>
            </div>

            <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 shadow-sm">
              <div className="w-12 h-12 bg-white text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <Banknote size={24} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Efectivo en Caja</p>
              <p className="text-3xl font-black text-emerald-700">${totalCash.toLocaleString()}</p>
            </div>

            <div className="bg-purple-50 p-6 rounded-[32px] border border-purple-100 shadow-sm">
              <div className="w-12 h-12 bg-white text-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                <Smartphone size={24} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 mb-1">Transferencias</p>
              <p className="text-3xl font-black text-purple-700">${totalTransfer.toLocaleString()}</p>
            </div>
          </div>

          {/* Performance Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Waiter Ranking */}
            <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-zinc-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-zinc-900 flex items-center gap-3">
                  <User size={20} className="text-orange-600" />
                  Desempeño del Equipo
                </h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Object.entries(waiterTotals).length === 0 ? (
                  <p className="text-zinc-400 text-xs italic py-4">No hay ventas registradas en este periodo.</p>
                ) : (
                  Object.entries(waiterTotals).sort((a:any, b:any) => b[1] - a[1]).map(([name, total]: [string, any], idx) => (
                    <div key={idx} className="flex items-center justify-between p-5 bg-zinc-50 rounded-3xl border border-zinc-100 group hover:border-orange-200 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white text-orange-600 rounded-2xl flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                          {name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-zinc-900">{name}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Total Vendido</p>
                        </div>
                      </div>
                      <p className="text-lg font-black text-orange-600">${total.toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-orange-600 p-8 rounded-[40px] text-white shadow-2xl shadow-orange-600/20 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-black mb-2">Historial de Ventas</h3>
                <p className="text-orange-100 text-xs leading-relaxed mb-8">
                  Consulta el detalle plato por plato, elimina órdenes accidentales o imprime recibos pasados.
                </p>
              </div>
              <Link 
                href="/admin/history"
                className="bg-white text-orange-600 py-4 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-orange-50 transition-all active:scale-95"
              >
                Ver Detalle Completo
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* Recent Feed Header */}
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-black text-zinc-950 flex items-center gap-3">
              <Clock size={20} className="text-orange-600" />
              Actividad Reciente
            </h3>
            <Link href="/admin/history" className="text-[10px] font-black uppercase tracking-widest text-orange-600 hover:underline">Ver todas</Link>
          </div>

          <div className="bg-white rounded-[40px] border border-zinc-100 shadow-sm overflow-hidden mb-8">
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead className="bg-zinc-50/50 border-b border-zinc-100">
                      <tr>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Hora</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Cliente / Origen</th>
                        <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Monto</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-50">
                      {orders.slice(0, 5).map(order => (
                        <tr key={order.id} className="hover:bg-zinc-50/50 transition-colors">
                           <td className="px-8 py-6">
                              <p className="text-xs font-black text-zinc-900">
                                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                              </p>
                           </td>
                           <td className="px-8 py-6">
                              <p className="text-xs font-black text-zinc-900">{order.customerName || `Pedido #${order.id}`}</p>
                              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500">{order.source}</p>
                           </td>
                           <td className="px-8 py-6 text-right font-black text-zinc-900 text-sm">
                              ${Number(order.total).toLocaleString()}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

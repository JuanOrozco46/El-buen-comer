"use client";

import { useEffect, useState } from "react";
import { 
  History, 
  Calendar, 
  Search, 
  Loader2, 
  User, 
  Banknote, 
  Smartphone, 
  CreditCard, 
  Hash,
  ShoppingBag,
  Clock
} from "lucide-react";
import { FullOrder } from "../../../types";

const methodLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

const methodIcons: Record<string, any> = {
  CASH: Banknote,
  CARD: CreditCard,
  TRANSFER: Smartphone,
  MIXED: Hash,
};

export default function SalesHistoryPage() {
  const [orders, setOrders] = useState<FullOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(new Date().toISOString().split("T")[0]);
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const fetchHistory = async () => {
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
    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <p className="text-orange-600 font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
            Reportes Avanzados
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-zinc-950">
            Historial de <span className="text-orange-600">Ventas</span>
          </h1>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-zinc-50 p-3 rounded-[24px] border border-zinc-100 w-full md:w-auto">
          <div className="flex items-center gap-2">
             <Calendar size={16} className="text-zinc-400 ml-2" />
             <input 
                type="date" 
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-zinc-700 focus:ring-0"
             />
             <span className="text-zinc-300 font-bold">→</span>
             <input 
                type="date" 
                value={to}
                onChange={e => setTo(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-zinc-700 focus:ring-0"
             />
          </div>
          <button 
             onClick={fetchHistory}
             className="bg-zinc-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-2 shadow-sm"
          >
             <Search size={14} />
             Filtrar
          </button>
        </div>
      </header>

      {/* Summary Mini-Cards */}
      {!loading && orders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
           <div className="bg-zinc-50 p-5 rounded-3xl border border-zinc-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm">
                <ShoppingBag size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Órdenes</p>
                <p className="text-2xl font-black">{orders.length}</p>
              </div>
           </div>
           <div className="bg-zinc-50 p-5 rounded-3xl border border-zinc-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
                <Banknote size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Total Recaudado</p>
                <p className="text-2xl font-black">${orders.reduce((s,o) => s + Number(o.total), 0).toLocaleString()}</p>
              </div>
           </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white border border-zinc-100 rounded-[32px] overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 gap-4">
            <Loader2 size={48} className="animate-spin text-orange-600" />
            <p className="font-black uppercase tracking-[0.3em] text-xs">Cargando datos...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 gap-4">
             <History size={64} className="opacity-10" />
             <p className="font-bold text-xs uppercase tracking-widest">No se encontraron ventas en este rango.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Fecha / Hora</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Cliente</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Platos & Detalles</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Monto</th>
                  <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-zinc-100 text-zinc-400 rounded-lg">
                            <Clock size={16} />
                         </div>
                         <div>
                            <p className="text-xs font-black text-zinc-900">{new Date(order.createdAt).toLocaleDateString()}</p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-black text-xs">
                             {order.customerName?.charAt(0) || <User size={14} />}
                          </div>
                          <p className="text-xs font-bold text-zinc-700 line-clamp-1 max-w-[150px]">
                            {order.customerName || `Pedido #${order.id}`}
                          </p>
                       </div>
                    </td>
                    <td className="px-6 py-5">
                       <div className="space-y-1.5">
                          {order.items.map((item: any, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                               <span className="w-5 h-5 bg-zinc-900 text-white text-[9px] flex items-center justify-center rounded-md font-black italic">{item.quantity}</span>
                               <div>
                                  <span className="text-xs font-black text-zinc-900">{item.product.name}</span>
                                  <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-md">{item.sizeName}</span>
                               </div>
                            </div>
                          ))}
                       </div>
                    </td>
                    <td className="px-6 py-5 text-right font-black text-zinc-900 text-sm">
                       ${Number(order.total).toLocaleString()}
                    </td>
                    <td className="px-6 py-5">
                       <div className="flex justify-center flex-wrap gap-1">
                          {order.payments && order.payments.length > 0 ? (
                            order.payments.map((p: any, idx) => {
                               const Icon = methodIcons[p.method] || Banknote;
                               return (
                                 <div key={idx} title={methodLabels[p.method]} className="p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all cursor-help">
                                    <Icon size={14} />
                                 </div>
                               );
                            })
                          ) : (
                            <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest italic">Pendiente</span>
                          )}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

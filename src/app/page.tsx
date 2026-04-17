"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { 
  TrendingUp, 
  ShoppingBag, 
  DollarSign, 
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Calendar,
  Banknote,
  CreditCard,
  Smartphone,
  Hash
} from "lucide-react";
import { useRouter } from "next/navigation";

type DateRange = "today" | "yesterday" | "week" | "month" | "custom";

interface DashboardData {
  revenue: number;
  totalOrders: number;
  pendingOrders: number;
  expenses: number;
  paymentsByMethod: { method: string; total: number; count: number }[];
  topProducts: { name: string; value: number }[];
  waiterPerformance: { name: string; orders: number }[];
  isPanicModeActive: boolean;
}

const rangeLabels: Record<DateRange, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  week: "Esta Semana",
  month: "Este Mes",
  custom: "Personalizado",
};

const methodIcons: Record<string, any> = {
  CASH: Banknote,
  CARD: CreditCard,
  TRANSFER: Smartphone,
  MIXED: Hash,
};

const methodLabels: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
};

const methodColors: Record<string, string> = {
  CASH: "text-emerald-600 bg-emerald-50",
  CARD: "text-blue-600 bg-blue-50",
  TRANSFER: "text-purple-600 bg-purple-50",
  MIXED: "text-amber-600 bg-amber-50",
};

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedRange, setSelectedRange] = useState<DateRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && session.user.role !== "ADMIN") {
      if (session.user.role === "CHEF") router.push("/kitchen");
      else router.push("/pos");
    }
  }, [status, session, router]);

  const fetchDashboard = async (range: DateRange) => {
    setLoading(true);
    try {
      let url = `/api/admin/dashboard?range=${range}`;
      if (range === "custom" && customFrom && customTo) {
        url += `&from=${customFrom}&to=${customTo}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && session.user.role === "ADMIN") {
      fetchDashboard(selectedRange);
    }
  }, [status, session, selectedRange]);

  const handleRangeChange = (range: DateRange) => {
    setSelectedRange(range);
  };

  const handleCustomSearch = () => {
    if (customFrom && customTo) fetchDashboard("custom");
  };

  const togglePanic = async () => {
    if (!data) return;
    try {
      const res = await fetch("/api/admin/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !data.isPanicModeActive })
      });
      const json = await res.json();
      setData({ ...data, isPanicModeActive: json.isPanicModeActive });
    } catch (err) {
      console.error(err);
    }
  };

  if (status === "loading" || (loading && !data)) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-orange-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-orange-600/10">
      <div className="flex flex-col flex-1 max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 gap-6 md:gap-8">
        
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
          <div>
            <p className="text-orange-600 font-black uppercase tracking-[0.2em] text-[10px] flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
              Operaciones en Tiempo Real
            </p>
            <h1 className="text-2xl md:text-4xl font-black tracking-tighter text-zinc-950">
              Panel <span className="text-orange-600">Dashboard</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
                onClick={togglePanic}
                className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border ${
                  data?.isPanicModeActive 
                  ? "bg-red-600 border-red-500 text-white shadow-xl shadow-red-600/30 animate-pulse" 
                  : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:text-orange-600 hover:border-orange-600"
                }`}
             >
                <AlertTriangle size={14} />
                {data?.isPanicModeActive ? "Pánico ON" : "Pánico"}
             </button>
          </div>
        </header>

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3 bg-zinc-50 p-2 md:p-3 rounded-2xl border border-zinc-100">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full lg:w-auto pb-2 lg:pb-0">
            <Calendar size={16} className="text-zinc-400 shrink-0 ml-2" />
            {(Object.keys(rangeLabels) as DateRange[]).filter(r => r !== "custom").map(range => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className={`px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] transition-all whitespace-nowrap ${
                  selectedRange === range
                    ? "bg-zinc-900 text-white shadow-md"
                    : "text-zinc-500 hover:bg-white hover:shadow-sm"
                }`}
              >
                {rangeLabels[range]}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-200/50">
            <input 
              type="date" 
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700"
            />
            <span className="text-zinc-400 text-xs font-bold">→</span>
            <input 
              type="date" 
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700"
            />
            <button 
              onClick={handleCustomSearch}
              className="h-9 px-5 bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 transition-all"
            >
              Filtrar
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-zinc-100 p-7 rounded-[32px] shadow-sm flex flex-col justify-between hover:border-orange-600 transition-all group">
            <div className="flex justify-between items-start mb-5">
              <div className="p-3 bg-orange-600/10 text-orange-600 rounded-2xl group-hover:bg-orange-600 group-hover:text-white transition-all">
                <DollarSign size={22} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">Ingresos</span>
            </div>
            <div>
              <h3 className="text-zinc-400 font-black uppercase tracking-widest text-[9px] mb-1">Ventas {rangeLabels[selectedRange]}</h3>
              <p className="text-3xl font-black tracking-tighter text-zinc-950">${data?.revenue.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-100 p-7 rounded-[32px] shadow-sm flex flex-col justify-between hover:border-blue-600 transition-all group">
            <div className="flex justify-between items-start mb-5">
              <div className="p-3 bg-blue-600/10 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                <ShoppingBag size={22} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{data?.totalOrders} Cobradas</span>
            </div>
            <div>
              <h3 className="text-zinc-400 font-black uppercase tracking-widest text-[9px] mb-1">Cuentas Abiertas</h3>
              <p className="text-3xl font-black tracking-tighter text-zinc-950">{data?.pendingOrders}</p>
            </div>
          </div>

          <div className="bg-white border border-zinc-100 p-7 rounded-[32px] shadow-sm flex flex-col justify-between hover:border-red-600 transition-all group">
            <div className="flex justify-between items-start mb-5">
              <div className="p-3 bg-red-600/10 text-red-600 rounded-2xl group-hover:bg-red-600 group-hover:text-white transition-all">
                <TrendingUp size={22} strokeWidth={3} className="rotate-180" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-2.5 py-1 rounded-lg">Egresos</span>
            </div>
            <div>
              <h3 className="text-zinc-400 font-black uppercase tracking-widest text-[9px] mb-1">Gastos Registrados</h3>
              <p className="text-3xl font-black tracking-tighter text-zinc-950">${data?.expenses.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-orange-600 p-7 rounded-[32px] flex flex-col justify-between shadow-xl shadow-orange-600/20">
            <div className="flex justify-between items-start mb-5">
              <div className="p-3 bg-white/20 text-white rounded-2xl">
                <CheckCircle2 size={22} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-white/60 bg-white/10 px-2.5 py-1 rounded-lg">Neto</span>
            </div>
            <div>
              <h3 className="text-white/60 font-black uppercase tracking-widest text-[9px] mb-1">Utilidad Estimada</h3>
              <p className="text-3xl font-black tracking-tighter text-white">${((data?.revenue || 0) - (data?.expenses || 0)).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Payment Breakdown + Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Payment Breakdown */}
          <div className="bg-white border border-zinc-100 p-8 rounded-[32px] shadow-sm">
            <h3 className="text-xl font-black mb-6 tracking-tight flex items-center justify-between">
              Desglose de Pagos
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">{rangeLabels[selectedRange]}</span>
            </h3>
            <div className="space-y-4">
              {data?.paymentsByMethod && data.paymentsByMethod.length > 0 ? (
                data.paymentsByMethod.map((p, idx) => {
                  const Icon = methodIcons[p.method] || DollarSign;
                  const colors = methodColors[p.method] || "text-zinc-600 bg-zinc-50";
                  return (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50/50 border border-zinc-100">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colors}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <p className="font-black text-sm text-zinc-900">{methodLabels[p.method] || p.method}</p>
                          <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">{p.count} transacciones</p>
                        </div>
                      </div>
                      <p className="text-xl font-black text-zinc-900">${p.total.toLocaleString()}</p>
                    </div>
                  );
                })
              ) : (
                <p className="text-zinc-400 font-bold uppercase tracking-widest text-center py-12 text-xs">Sin pagos en este período</p>
              )}
            </div>
          </div>

          {/* Product Chart */}
          <div className="bg-white border border-zinc-100 p-8 rounded-[32px] shadow-sm">
             <h3 className="text-xl font-black mb-6 tracking-tight flex items-center justify-between">
                Rendimiento de Platos
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">{rangeLabels[selectedRange]}</span>
             </h3>
             <div className="space-y-6">
                {data?.topProducts.map((p, idx) => (
                  <div key={idx} className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-zinc-500">{p.name}</span>
                        <span className="text-orange-600">{p.value} und</span>
                     </div>
                     <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-600 rounded-full transition-all duration-1000" 
                          style={{ width: `${(p.value / (data.topProducts[0]?.value || 1)) * 100}%` }}
                        />
                     </div>
                  </div>
                ))}
                {data?.topProducts.length === 0 && <p className="text-zinc-400 font-bold uppercase tracking-widest text-center py-12 text-xs">Sin ventas en este período</p>}
             </div>
          </div>

          {/* Staff Table */}
          <div className="bg-white border border-zinc-100 p-8 rounded-[32px] shadow-sm">
             <h3 className="text-xl font-black mb-6 tracking-tight flex items-center justify-between">
                Actividad de Staff
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Total</span>
             </h3>
             <div className="space-y-3">
                {data?.waiterPerformance.map((w, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-zinc-50/50 rounded-2xl border border-zinc-100">
                     <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-white border border-zinc-200 rounded-xl flex items-center justify-center font-black text-orange-600 text-base shadow-sm">
                           {w.name.charAt(0)}
                        </div>
                        <div>
                           <p className="font-black text-sm text-zinc-900">{w.name}</p>
                           <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Staff</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-xl font-black text-zinc-900">{w.orders}</p>
                        <p className="text-[9px] text-orange-600 font-black uppercase tracking-widest">Órdenes</p>
                     </div>
                  </div>
                ))}
                {data?.waiterPerformance.length === 0 && <p className="text-zinc-400 font-bold uppercase tracking-widest text-center py-12 text-xs">Sin actividad en este período</p>}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

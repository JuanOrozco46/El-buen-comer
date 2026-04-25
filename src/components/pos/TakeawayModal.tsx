"use client";

import { useState } from "react";
import { X, ShoppingBag, User, Phone, Smartphone } from "lucide-react";

interface TakeawayData {
  name: string;
  phone: string;
  method: string;
  splitCash?: number;
  splitTransfer?: number;
}

interface Props {
  onCancel: () => void;
  onConfirm: (data: TakeawayData) => void;
}

export function TakeawayModal({ onCancel, onConfirm }: Props) {
  const [data, setData] = useState<TakeawayData>({
    name: "",
    phone: "",
    method: "EFECTIVO", // Default
    splitCash: 0,
    splitTransfer: 0
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.name) {
      onConfirm(data);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-8 bg-zinc-50 border-b border-zinc-100">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-purple-100 text-purple-600 rounded-[28px] shadow-sm">
              <ShoppingBag size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Para Llevar</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Nuevo pedido en barra</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="p-3 bg-white text-zinc-400 hover:text-zinc-600 rounded-2xl shadow-sm border border-zinc-100 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-2">Nombre Cliente</label>
            <div className="relative">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                autoFocus
                className="w-full bg-zinc-50 border border-zinc-200 rounded-3xl py-5 pl-14 pr-6 font-bold text-zinc-900 focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all text-lg"
                placeholder="Ej. Carlos"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-2">Teléfono (Opcional)</label>
            <div className="relative">
              <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-3xl py-5 pl-14 pr-6 font-bold text-zinc-900 focus:outline-none focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 transition-all text-lg"
                placeholder="Opcional"
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-2">Medio de Pago Estimado</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setData({ ...data, method: "EFECTIVO" })}
                className={`py-5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all border-4 ${
                  data.method === "EFECTIVO" 
                    ? "bg-zinc-900 border-zinc-900 text-white shadow-xl shadow-zinc-900/20" 
                    : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                }`}
              >
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setData({ ...data, method: "TRANSFERENCIA" })}
                className={`py-5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all border-4 ${
                  data.method === "TRANSFERENCIA" 
                    ? "bg-purple-600 border-purple-600 text-white shadow-xl shadow-purple-600/20" 
                    : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                }`}
              >
                Transf.
              </button>
              <button
                type="button"
                onClick={() => setData({ ...data, method: "DIVIDIR" })}
                className={`py-5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-all border-4 ${
                  data.method === "DIVIDIR" 
                    ? "bg-zinc-800 border-zinc-800 text-white shadow-xl shadow-zinc-800/20" 
                    : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                }`}
              >
                Dividir
              </button>
            </div>
          </div>

          {data.method === "DIVIDIR" && (
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
               <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Monto Efectivo</label>
                <div className="relative text-left">
                  <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600">
                    <span className="font-bold">$</span>
                  </button>
                  <input
                    type="number"
                    className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl py-3 pl-10 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                    placeholder="Efectivo"
                    value={data.splitCash || ''}
                    onChange={(e) => setData({ ...data, splitCash: Number(e.target.value) })}
                  />
                </div>
               </div>
               <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Monto Transf.</label>
                <div className="relative text-left">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-600" size={16} />
                  <input
                    type="number"
                    className="w-full bg-purple-50 border border-purple-100 rounded-2xl py-3 pl-10 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm"
                    placeholder="Transferencia"
                    value={data.splitTransfer || ''}
                    onChange={(e) => setData({ ...data, splitTransfer: Number(e.target.value) })}
                  />
                </div>
               </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!data.name}
            className={`w-full mt-6 py-6 rounded-[32px] flex items-center justify-center gap-3 shadow-2xl active:scale-95 transition-all text-xs font-black uppercase tracking-widest ${
              (!data.name)
                ? "bg-zinc-100 text-zinc-300 cursor-not-allowed shadow-none"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30"
            }`}
          >
            Empezar Pedido
          </button>
        </form>
      </div>
    </div>
  );
}

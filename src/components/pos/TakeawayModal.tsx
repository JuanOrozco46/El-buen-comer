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

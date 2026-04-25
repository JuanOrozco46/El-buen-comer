"use client";

import { useState } from "react";
import { X, Truck, User, Phone, MapPin, Receipt, DollarSign } from "lucide-react";

interface DeliveryData {
  name: string;
  phone: string;
  address: string;
  method: string;
  fee: number;
}

interface Props {
  onCancel: () => void;
  onConfirm: (data: DeliveryData) => void;
}

export function DeliveryModal({ onCancel, onConfirm }: Props) {
  const [data, setData] = useState<DeliveryData>({
    name: "",
    phone: "",
    address: "",
    method: "EFECTIVO", // Default
    fee: 3000, // Default fee
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.name && data.address) {
      onConfirm(data);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 bg-zinc-50 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl">
              <Truck size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black">Nuevo Domicilio</h2>
              <p className="text-xs font-bold text-zinc-500">Completa los datos de envío</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="p-3 bg-white text-zinc-400 hover:text-zinc-600 rounded-xl shadow-sm border border-zinc-100"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Nombre Cliente</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="Ej. Juan Pérez"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Teléfono</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="Opcional"
                value={data.phone}
                onChange={(e) => setData({ ...data, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Dirección de Entrega</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="Ej. Calle 123 #45-67 apto 801"
                value={data.address}
                onChange={(e) => setData({ ...data, address: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Método de Pago</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setData({ ...data, method: "EFECTIVO" })}
                className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 ${
                  data.method === "EFECTIVO" 
                    ? "bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-600/20" 
                    : "bg-zinc-50 border-zinc-100 text-zinc-400 hover:border-zinc-200"
                }`}
              >
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setData({ ...data, method: "TRANSFERENCIA" })}
                className={`py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 ${
                  data.method === "TRANSFERENCIA" 
                    ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-600/20" 
                    : "bg-zinc-50 border-zinc-100 text-zinc-400 hover:border-zinc-200"
                }`}
              >
                Transferencia
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Valor Domicilio ($)</label>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="number"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="Ej. 3000"
                value={data.fee}
                onChange={(e) => setData({ ...data, fee: Number(e.target.value) })}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!data.name || !data.address}
            className={`w-full mt-6 py-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-sm font-black uppercase tracking-widest ${
              (!data.name || !data.address)
                ? "bg-zinc-100 text-zinc-300 cursor-not-allowed shadow-none"
                : "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20"
            }`}
          >
            Continuar con el Pedido
          </button>
        </form>
      </div>
    </div>
  );
}

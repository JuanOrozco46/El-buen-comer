"use client";

import { useState } from "react";
import { X, Truck, User, Phone, MapPin, Receipt } from "lucide-react";

interface DeliveryData {
  name: string;
  phone: string;
  address: string;
  method: string;
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
                required
                autoFocus
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
                required
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                placeholder="Ej. Calle 123 #45-67 apto 801"
                value={data.address}
                onChange={(e) => setData({ ...data, address: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Método de Pago</label>
            <div className="relative">
              <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <select
                required
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all appearance-none"
                value={data.method}
                onChange={(e) => setData({ ...data, method: e.target.value })}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="NEQUI">Nequi / Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-orange-600/20 active:scale-95 transition-all text-xs tracking-widest uppercase"
          >
            Continuar con el Pedido
          </button>
        </form>
      </div>
    </div>
  );
}

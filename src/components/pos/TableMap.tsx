"use client";

import { useEffect, useState } from "react";
import { Table } from "../../types";
import { Loader2, Users, Truck, ShoppingBag } from "lucide-react";

interface Props {
  onSelect: (table: Table) => void;
  onSelectDelivery?: () => void;
  selectedTableId?: number;
  onSelectTakeaway?: () => void;
}

export function TableMap({ onSelect, onSelectDelivery, onSelectTakeaway, selectedTableId }: Props) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTables = () => {
      fetch("/api/tables")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTables(data);
        })
        .finally(() => setLoading(false));
    };

    fetchTables();
    const interval = setInterval(fetchTables, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20">
        <Loader2 className="animate-spin text-orange-500 mb-4" size={40} />
        <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs">Cargando Mesas...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4 md:p-6">
      {/* Botón Permanente de Domicilios */}
      {onSelectDelivery && (
        <button
          onClick={onSelectDelivery}
          className="aspect-square rounded-[32px] p-4 flex flex-col items-center justify-center gap-2 transition-all duration-300 border-2 bg-orange-600 border-orange-600 text-white shadow-xl shadow-orange-600/30 hover:scale-105"
        >
          <div className="p-3 rounded-2xl bg-white/20">
            <Truck size={24} />
          </div>
          <span className="text-xl font-black mt-1 leading-none text-center">DOMICILIO</span>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Nuevo Envío</span>
        </button>
      )}

      {/* Botón Permanente de Para Llevar */}
      {onSelectTakeaway && (
        <button
          onClick={onSelectTakeaway}
          className="aspect-square rounded-[32px] p-4 flex flex-col items-center justify-center gap-2 transition-all duration-300 border-2 bg-purple-600 border-purple-600 text-white shadow-xl shadow-purple-600/30 hover:scale-105"
        >
          <div className="p-3 rounded-2xl bg-white/20">
            <ShoppingBag size={24} />
          </div>
          <span className="text-xl font-black mt-1 leading-none text-center">PARA LLEVAR</span>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Nuevo Pedido</span>
        </button>
      )}

      {tables.map(table => {
        const hasOrder = table.orders && table.orders.length > 0;
        const activeOrderId = hasOrder ? table.orders![0].id : null;
        
        return (
          <button
            key={table.id}
            onClick={() => onSelect(table)}
            className={`
              aspect-square rounded-[32px] p-4 flex flex-col items-center justify-center gap-2 transition-all duration-300 border-2
              ${selectedTableId === table.id 
                ? "bg-orange-600 border-orange-600 text-white shadow-xl shadow-orange-600/30 scale-105" 
                : hasOrder
                  ? "bg-orange-50 border-orange-200 text-orange-900 shadow-md shadow-orange-900/5 hover:border-orange-400"
                  : "bg-white border-zinc-100 text-zinc-900 hover:border-orange-200 hover:shadow-lg"
              }
            `}
          >
            <div className={`p-3 rounded-2xl ${selectedTableId === table.id ? "bg-white/20" : hasOrder ? "bg-orange-200/50" : "bg-zinc-50"}`}>
              <Users size={24} className={hasOrder && selectedTableId !== table.id ? "text-orange-700" : ""} />
            </div>
            <span className="text-xl font-black">{table.number}</span>
            {hasOrder ? (
              <div className="flex flex-col items-center">
                 <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">Ocupada</span>
                 <span className="text-[10px] font-bold opacity-60">Orden #{activeOrderId}</span>
              </div>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Disponible</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

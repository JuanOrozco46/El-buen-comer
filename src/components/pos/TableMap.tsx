"use client";

import { useEffect, useState } from "react";
import { Table } from "../../types";
import { Loader2, Users } from "lucide-react";

interface Props {
  onSelect: (table: Table) => void;
  selectedTableId?: number;
}

export function TableMap({ onSelect, selectedTableId }: Props) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tables")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTables(data);
      })
      .finally(() => setLoading(false));
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 p-4 md:p-8">
      {tables.map(table => (
        <button
          key={table.id}
          onClick={() => onSelect(table)}
          className={`
            aspect-square rounded-[32px] p-6 flex flex-col items-center justify-center gap-3 transition-all duration-300 border-2
            ${selectedTableId === table.id 
              ? "bg-orange-600 border-orange-600 text-white shadow-xl shadow-orange-600/30 scale-105" 
              : table.status === "OCCUPIED"
                ? "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-60 cursor-not-allowed"
                : "bg-white border-zinc-100 text-zinc-900 hover:border-orange-200 hover:shadow-lg"
            }
          `}
        >
          <div className={`p-3 rounded-2xl ${selectedTableId === table.id ? "bg-white/20" : "bg-zinc-50"}`}>
            <Users size={24} />
          </div>
          <span className="text-xl font-black">{table.number}</span>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
            {table.status === "OCCUPIED" ? "Ocupada" : "Disponible"}
          </span>
        </button>
      ))}
    </div>
  );
}

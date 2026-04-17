"use client";

import { useState } from "react";
import { ListChecks, Save, Plus, Trash2, Info } from "lucide-react";

interface RecipeItem {
  ingredientId: number;
  name: string;
  grammage: number;
  unit: string;
}

const MOCK_RECIPE: RecipeItem[] = [
  { ingredientId: 1, name: "Arroz Premium", grammage: 250, unit: "g" },
  { ingredientId: 2, name: "Cerdo Troceado", grammage: 80, unit: "g" },
  { ingredientId: 5, name: "Plátano Madurito", grammage: 0.5, unit: "u" },
];

export default function RecipePage() {
  const [items, setItems] = useState(MOCK_RECIPE);

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      <main className="flex-1 flex flex-col p-10 overflow-y-auto max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-10">
          <div>
            <span className="text-orange-500 font-black uppercase tracking-widest text-xs">Administración</span>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tight mt-1">Configurar Receta</h1>
            <p className="text-zinc-500 font-medium mt-2 flex items-center gap-2">
              <Info size={16} /> 
              Define los ingredientes que se descuentan por cada porción vendida.
            </p>
          </div>
          <button className="flex items-center gap-2 bg-green-600 text-white px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-green-700 transition-all shadow-xl shadow-green-600/20 active:scale-95">
            <Save size={18} />
            <span>Guardar Cambios</span>
          </button>
        </header>

        <div className="bg-white rounded-[40px] border border-zinc-100 shadow-xl overflow-hidden">
          <div className="p-8 bg-zinc-900 text-white flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-orange-500 font-black uppercase tracking-widest text-[10px]">Producto Seleccionado</span>
              <h2 className="text-2xl font-black">Arroz Paisa Familiar</h2>
            </div>
            <div className="px-4 py-2 bg-zinc-800 rounded-xl border border-zinc-700 flex items-center gap-2">
              <ListChecks size={20} className="text-orange-500" />
              <span className="font-bold text-sm">3 Ingredientes</span>
            </div>
          </div>

          <div className="p-10 space-y-6">
            {items.map((item, idx) => (
              <div key={item.ingredientId} className="flex items-center gap-6 p-6 rounded-3xl bg-zinc-50 border border-zinc-100 group transition-all hover:border-orange-200 hover:bg-white hover:shadow-lg hover:shadow-orange-500/5">
                <div className="w-12 h-12 flex items-center justify-center bg-white rounded-2xl border border-zinc-100 font-black text-zinc-400 group-hover:bg-orange-500 group-hover:text-white group-hover:border-orange-500 transition-all">
                  {idx + 1}
                </div>
                
                <div className="flex-1 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Ingrediente</span>
                  <select className="bg-transparent font-black text-zinc-800 text-xl outline-none border-none p-0 cursor-pointer">
                    <option>{item.name}</option>
                  </select>
                </div>

                <div className="w-48 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Gramaje / Cantidad</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2 font-black text-zinc-900 outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                      value={item.grammage}
                      onChange={() => {}} 
                    />
                    <span className="font-black text-zinc-400 uppercase text-xs">{item.unit}</span>
                  </div>
                </div>

                <button className="mt-4 p-3 text-zinc-300 hover:text-red-500 transition-all">
                  <Trash2 size={20} />
                </button>
              </div>
            ))}

            <button className="w-full py-5 border-2 border-dashed border-zinc-200 rounded-3xl flex items-center justify-center gap-3 text-zinc-400 font-black uppercase tracking-widest text-xs hover:border-orange-500 hover:text-orange-500 transition-all group active:scale-95">
              <Plus size={20} className="group-hover:scale-125 transition-transform" />
              <span>Agregar Ingrediente a la Receta</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

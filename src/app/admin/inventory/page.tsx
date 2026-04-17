"use client";

import { useState, useEffect } from "react";
import { Package, Plus, Search, AlertTriangle, Loader2, Trash2, Edit2, Save, X } from "lucide-react";

interface Ingredient {
  id: number;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
}

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [form, setForm] = useState({ name: "", unit: "g", stock: "", minStock: "" });

  const fetchIngredients = async () => {
    try {
      const res = await fetch("/api/ingredients");
      const data = await res.json();
      if (Array.isArray(data)) setIngredients(data);
    } catch (error) {
      console.error("Error fetching ingredients:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIngredients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;

      const res = await fetch("/api/ingredients", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        fetchIngredients();
        setIsModalOpen(false);
        setEditingId(null);
        setForm({ name: "", unit: "g", stock: "", minStock: "" });
      }
    } catch (error) {
      console.error("Error saving ingredient:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este ingrediente?")) return;
    try {
      const res = await fetch(`/api/ingredients?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchIngredients();
    } catch (error) {
      console.error("Error deleting ingredient:", error);
    }
  };

  const openEdit = (ing: Ingredient) => {
    setEditingId(ing.id);
    setForm({
      name: ing.name,
      unit: ing.unit,
      stock: ing.stock.toString(),
      minStock: ing.minStock.toString()
    });
    setIsModalOpen(true);
  };

  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 bg-white font-sans h-screen overflow-hidden flex flex-col">
      <main className="flex-1 flex flex-col p-8 md:p-12 overflow-hidden bg-white">
        <header className="flex justify-between items-end mb-10 shrink-0">
          <div>
            <span className="text-orange-500 font-black uppercase tracking-widest text-xs">Administración</span>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tight mt-1">Inventario</h1>
          </div>
          <button 
            onClick={() => { setEditingId(null); setForm({ name: "", unit: "g", stock: "", minStock: "" }); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-4 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 active:scale-95"
          >
            <Plus size={18} />
            <span>Nuevo Insumo</span>
          </button>
        </header>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 shrink-0">
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Package size={28} />
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Insumos Registrados</p>
              <p className="text-3xl font-black text-zinc-900">{ingredients.length}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
              <AlertTriangle size={28} />
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Alerta de Stock Bajo</p>
              <p className="text-3xl font-black text-red-600">{ingredients.filter(i => i.stock <= i.minStock).length}</p>
            </div>
          </div>
        </div>

        {/* Search & List */}
        <div className="bg-white rounded-[40px] border border-zinc-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/30 shrink-0">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar insumos..."
                className="w-full h-12 pl-12 pr-4 bg-white border border-zinc-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {loading && ingredients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                <Loader2 className="animate-spin mb-4" size={48} />
                <p className="font-bold uppercase tracking-widest text-xs">Cargando almacén...</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10 border-b border-zinc-100">
                  <tr className="bg-zinc-50/50">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Insumo</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Stock Actual</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400">Nivel Crítico</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {filtered.map(ing => (
                    <tr key={ing.id} className="hover:bg-zinc-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex flex-col leading-tight">
                          <span className="font-black text-zinc-900 text-lg group-hover:text-orange-600 transition-colors">{ing.name}</span>
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Métrica: {ing.unit === 'g' ? 'Gramos' : 'Unidades'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl font-black ${ing.stock <= ing.minStock ? "text-red-500" : "text-zinc-900"}`}>
                            {Number(ing.stock).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">{ing.unit}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-zinc-500 font-bold">{Number(ing.minStock).toLocaleString()} {ing.unit}</span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(ing)} className="p-3 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-orange-500 hover:text-white transition-all shadow-sm">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(ing.id)} className="p-3 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-red-500 hover:text-white transition-all shadow-sm">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && filtered.length === 0 && (
              <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                <Package size={64} className="opacity-10 mb-4" />
                <p className="font-bold uppercase tracking-widest text-xs">No se encontraron insumos</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal for Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden border border-zinc-200">
            <div className="px-10 pt-10 pb-6 flex justify-between items-center">
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight">
                {editingId ? "Editar Insumo" : "Nuevo Insumo"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors">
                <X size={28} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="px-10 pb-12 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Nombre del Ingrediente</label>
                <input 
                  type="text" 
                  required 
                  className="w-full bg-zinc-100 border border-zinc-200 rounded-2xl px-6 py-4 text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-zinc-500"
                  placeholder="Ej: Pollo Desmechado"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Unidad</label>
                  <select 
                    className="w-full bg-zinc-100 border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-orange-500 transition-all appearance-none"
                    value={form.unit}
                    onChange={e => setForm({...form, unit: e.target.value})}
                  >
                    <option value="g">Gramos (g)</option>
                    <option value="unit">Unidades (u)</option>
                    <option value="ml">Mililitros (ml)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Stock Inicial</label>
                  <input 
                    type="number" 
                    required 
                    className="w-full bg-zinc-100 border border-zinc-200 rounded-2xl px-6 py-4 text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-zinc-500"
                    placeholder="0"
                    value={form.stock}
                    onChange={e => setForm({...form, stock: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 block">Stock Mínimo (Alerta)</label>
                <input 
                  type="number" 
                  required 
                  className="w-full bg-zinc-100 border border-zinc-200 rounded-2xl px-6 py-4 text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-zinc-500"
                  placeholder="Ej: 1000"
                  value={form.minStock}
                  onChange={e => setForm({...form, minStock: e.target.value})}
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-5 rounded-3xl uppercase tracking-widest text-sm shadow-xl shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? "Procesando..." : editingId ? "Guardar Cambios" : "Registrar Insumo"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

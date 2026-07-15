"use client";

import { useState, useEffect } from "react";
import { 
  Plus, Search, Loader2, Trash2, Edit2, Save, X, 
  Utensils, ChevronRight, Layers, Beaker, Tag, Power
} from "lucide-react";

interface Ingredient {
  id: number;
  name: string;
  unit: string;
}

interface ProductSize {
  id?: number;
  name: string;
  price: string | number;
  isSoldOut?: boolean;
}

interface RecipeItem {
  ingredientId: string | number;
  sizeName: string;
  quantity: string | number;
}

interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  isSoldOut: boolean;
  sizes: ProductSize[];
  recipes: any[];
}

export default function MenuManagementPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form states
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Arroces",
    sizes: [{ name: "Personal", price: "" }] as ProductSize[],
    recipes: [] as RecipeItem[]
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [prodRes, ingRes] = await Promise.all([
        fetch("/api/admin/products"),
        fetch("/api/ingredients")
      ]);
      setProducts(await prodRes.json());
      setIngredients(await ingRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveError(null);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { ...form, id: editingId } : form;

      const res = await fetch("/api/admin/products", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        fetchData();
        setIsModalOpen(false);
        setEditingId(null);
        resetForm();
        setSaveError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveError(errData.error || "Error al guardar el producto. Revisa que todos los campos estén completos.");
      }
    } catch (error) {
      console.error("Error saving product:", error);
      setSaveError("Error de conexión. Verifica tu internet y prueba de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      category: "Arroces",
      sizes: [{ name: "Personal", price: "" }],
      recipes: []
    });
  };

  const addSize = () => {
    setForm({ ...form, sizes: [...form.sizes, { name: "", price: "", isSoldOut: false }] });
  };

  const removeSize = (index: number) => {
    const newSizes = form.sizes.filter((_, i) => i !== index);
    setForm({ ...form, sizes: newSizes });
  };

  const addRecipeItem = () => {
    setForm({ 
      ...form, 
      recipes: [...form.recipes, { ingredientId: "", sizeName: form.sizes[0]?.name || "Personal", quantity: "" }] 
    });
  };

  const removeRecipeItem = (index: number) => {
    const newRecipes = form.recipes.filter((_, i) => i !== index);
    setForm({ ...form, recipes: newRecipes });
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description || "",
      category: p.category,
      sizes: p.sizes.map(s => ({ name: s.name, price: Number(s.price).toString(), isSoldOut: s.isSoldOut })),
      recipes: p.recipes.map(r => ({ 
        ingredientId: r.ingredientId, 
        sizeName: r.sizeName, 
        quantity: Number(r.quantity).toString() 
      }))
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar este producto?")) return;
    try {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'No se pudo eliminar el producto'}. Asegúrate de que no tenga comandas activas.`);
      }
    } catch (error) {
      console.error("Error deleting product:", error);
    }
  };

  const toggleProductStatus = async (id: number, currentStatus: boolean) => {
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentStatus })
      });
      if (res.ok) {
        setProducts(products.map(p => p.id === id ? { ...p, isActive: !currentStatus } : p));
      }
    } catch (error) {
      console.error("Error toggling product status:", error);
    }
  };

  const toggleSizeStatus = async (productId: number, sizeId?: number, currentSoldOut?: boolean) => {
    if (!sizeId) return;
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, sizeId, sizeIsSoldOut: !currentSoldOut })
      });
      if (res.ok) {
        setProducts(products.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              sizes: p.sizes.map((s: any) => s.id === sizeId ? { ...s, isSoldOut: !currentSoldOut } : s)
            };
          }
          return p;
        }));
      }
    } catch (error) {
      console.error("Error toggling size status:", error);
    }
  };

  return (
    <div className="flex-1 bg-white font-sans h-screen overflow-hidden flex flex-col">
      <main className="flex-1 flex flex-col p-8 md:p-12 overflow-hidden bg-white">
        <header className="flex justify-between items-end mb-10 shrink-0">
          <div>
            <span className="text-orange-500 font-black uppercase tracking-widest text-xs">Administración</span>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tight mt-1">Gestión de Carta</h1>
          </div>
          <button 
            onClick={() => { resetForm(); setEditingId(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 bg-orange-600 text-white px-8 py-4 rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-orange-700 transition-all shadow-xl shadow-orange-600/20 active:scale-95"
          >
            <Plus size={18} />
            <span>Nuevo Plato</span>
          </button>
        </header>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                <Loader2 className="animate-spin mb-4" size={48} />
                <p className="font-bold uppercase tracking-widest text-xs">Cargando carta...</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-white rounded-[40px] p-8 shadow-sm border border-zinc-200 flex flex-col hover:border-orange-200 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                        <Utensils size={20} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{product.category}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button 
                        onClick={() => toggleProductStatus(product.id, product.isActive)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          product.isActive 
                            ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" 
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                        title={product.isActive ? "Desactivar plato" : "Activar plato"}
                      >
                        <Power size={14} />
                        <span className="hidden sm:inline">{product.isActive ? "Activo" : "Inactivo"}</span>
                      </button>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(product)} className="p-2 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-orange-500 hover:text-white transition-all"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(product.id)} className="p-2 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>

                  <h3 className={`text-2xl font-black mb-2 leading-tight transition-colors ${product.isActive ? "text-zinc-900" : "text-zinc-400"}`}>{product.name}</h3>
                  <p className="text-sm font-medium text-zinc-500 line-clamp-2 mb-6">{product.description}</p>

                  <div className="mt-auto pt-6 border-t border-zinc-100">
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map((s: any, i) => (
                        <button 
                          key={i}
                          onClick={() => toggleSizeStatus(product.id, s.id, s.isSoldOut)}
                          className={`px-4 py-2 rounded-2xl border text-left transition-all ${
                            s.isSoldOut 
                              ? "bg-red-50 border-red-200 text-red-650 hover:bg-red-100" 
                              : "bg-zinc-50 border-zinc-100 text-zinc-900 hover:bg-zinc-100 active:scale-95"
                          }`}
                          title={s.isSoldOut ? "Marcar como disponible" : "Marcar como agotado"}
                        >
                          <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1 ${s.isSoldOut ? "text-red-400" : "text-zinc-400"}`}>
                            {s.name} {s.isSoldOut && "❌"}
                          </p>
                          <p className={`font-black text-sm ${s.isSoldOut ? "line-through text-red-700" : "text-zinc-900"}`}>
                            ${Number(s.price).toLocaleString()}
                          </p>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-widest">
                       <Beaker size={14} /> 
                       <span>{product.recipes.length} Ingredientes vinculados</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal - Recipe & Product Editor */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-zinc-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[48px] shadow-2xl overflow-hidden border border-white/20 flex flex-col">
            <div className="px-12 pt-12 pb-8 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-4xl font-black text-zinc-900 tracking-tight">
                  {editingId ? "Editar Carpeta de Plato" : "Crear Nueva Receta"}
                </h2>
                <p className="text-zinc-500 font-medium mt-1">Configura tamaños, precios e ingredientes base.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-all">
                <X size={32} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Basic Info */}
                <div className="space-y-8">
                  <div className="space-y-6">
                    <h3 className="text-xl font-black text-zinc-900 flex items-center gap-2">
                       <Tag size={20} className="text-orange-500" /> Información Base
                    </h3>
                    <div className="space-y-4">
                      <input 
                        type="text" placeholder="Nombre completo del plato" required 
                        className="w-full h-16 bg-zinc-50 border border-zinc-200 rounded-3xl px-8 text-lg font-bold text-zinc-900 focus:ring-4 focus:ring-orange-500/10 outline-none placeholder:text-zinc-400"
                        value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                      />
                      <textarea 
                        placeholder="Descripción de ingredientes para el ticket..." rows={3}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-3xl px-8 py-5 text-sm font-medium text-zinc-900 focus:ring-4 focus:ring-orange-500/10 outline-none resize-none placeholder:text-zinc-400"
                        value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      />
                      <select 
                        className="w-full h-16 bg-zinc-50 border border-zinc-200 rounded-3xl px-8 text-sm font-black uppercase tracking-widest focus:ring-4 focus:ring-orange-500/10 outline-none appearance-none"
                        value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                      >
                        <option value="Arroces">Arroces</option>
                        <option value="Acompañantes">Acompañantes</option>
                        <option value="Bebidas">Bebidas</option>
                        <option value="Adiciones">Adiciones</option>
                      </select>
                    </div>
                  </div>

                  {/* Sizes */}
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                       <h3 className="text-xl font-black text-zinc-900 flex items-center gap-2">
                         <Layers size={20} className="text-blue-500" /> Tamaños y Precios
                       </h3>
                       <button type="button" onClick={addSize} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all">+ Añadir Tamaño</button>
                    </div>
                    <div className="space-y-3">
                      {form.sizes.map((size, idx) => (
                        <div key={idx} className="flex gap-3 animate-in slide-in-from-left-2 duration-300">
                          <input 
                            type="text" placeholder="Ej: Personal" required
                            className="flex-1 h-14 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 text-sm font-bold text-zinc-900 placeholder:text-zinc-400"
                            value={size.name} onChange={e => {
                              const ns = [...form.sizes];
                              ns[idx].name = e.target.value;
                              setForm({...form, sizes: ns});
                            }}
                          />
                          <input 
                            type="number" placeholder="Precio" required
                            className="w-32 h-14 bg-zinc-50 border border-zinc-100 rounded-2xl px-6 text-sm font-black text-orange-600"
                            value={size.price} onChange={e => {
                              const ns = [...form.sizes];
                              ns[idx].price = e.target.value;
                              setForm({...form, sizes: ns});
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const ns = [...form.sizes];
                              ns[idx].isSoldOut = !ns[idx].isSoldOut;
                              setForm({...form, sizes: ns});
                            }}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                              size.isSoldOut ? "bg-red-50 text-red-500 hover:bg-red-150" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            }`}
                            title={size.isSoldOut ? "Marcar como disponible" : "Marcar como agotado/inactivo"}
                          >
                            {size.isSoldOut ? "❌" : "✅"}
                          </button>
                          {form.sizes.length > 1 && (
                            <button type="button" onClick={() => removeSize(idx)} className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-100 transition-all"><Trash2 size={18} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recipe Mapping */}
                <div className="space-y-8 bg-zinc-50/50 p-8 rounded-[40px] border border-zinc-100">
                  <div className="flex justify-between items-center">
                     <h3 className="text-xl font-black text-zinc-900 flex items-center gap-2">
                       <Beaker size={20} className="text-emerald-500" /> Receta (Descuento Auto)
                     </h3>
                     <button type="button" onClick={addRecipeItem} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">+ Añadir Insumo</button>
                  </div>
                  
                  {form.recipes.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-zinc-400 border-2 border-dashed border-zinc-200 rounded-3xl opacity-50">
                       <Plus size={32} className="mb-2" />
                       <p className="text-xs font-bold uppercase tracking-widest">Sin insumos vinculados</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {form.recipes.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 animate-in slide-in-from-right-2 duration-300">
                          <select 
                            required
                            className="col-span-5 h-14 bg-white border border-zinc-200 rounded-2xl px-4 text-xs font-bold text-zinc-900 appearance-none placeholder:text-zinc-400"
                            value={r.ingredientId} onChange={e => {
                              const nr = [...form.recipes];
                              nr[idx].ingredientId = e.target.value;
                              setForm({...form, recipes: nr});
                            }}
                          >
                            <option value="">Seleccionar Insumo...</option>
                            {ingredients.map(ing => (
                              <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                            ))}
                          </select>
                          <select 
                            required
                            className="col-span-3 h-14 bg-white border border-zinc-200 rounded-2xl px-4 text-xs font-bold text-zinc-900 appearance-none placeholder:text-zinc-400"
                            value={r.sizeName} onChange={e => {
                              const nr = [...form.recipes];
                              nr[idx].sizeName = e.target.value;
                              setForm({...form, recipes: nr});
                            }}
                          >
                            {form.sizes.map(s => <option key={s.name} value={s.name}>{s.name || "Sin nombre"}</option>)}
                          </select>
                          <input 
                            type="number" placeholder="Cant." required
                            className="col-span-3 h-14 bg-white border border-zinc-200 rounded-2xl px-4 text-xs font-black text-emerald-600"
                            value={r.quantity} onChange={e => {
                              const nr = [...form.recipes];
                              nr[idx].quantity = e.target.value;
                              setForm({...form, recipes: nr});
                            }}
                          />
                          <button type="button" onClick={() => removeRecipeItem(idx)} className="col-span-1 h-14 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"><X size={18} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] font-medium text-zinc-400 italic">Nota: Al cobrarse este plato, se descontará automáticamente la cantidad indicada del inventario para el tamaño seleccionado.</p>
                </div>
              </div>

              <div className="mt-12 flex flex-col gap-4 shrink-0">
                {saveError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-3xl px-8 py-5 text-sm font-bold flex items-center gap-3">
                    <X size={18} className="shrink-0 text-red-500" />
                    <span>{saveError}</span>
                  </div>
                )}
                <button 
                  type="submit" disabled={loading}
                  className="flex-1 bg-zinc-900 hover:bg-black text-white font-black py-6 rounded-[32px] uppercase tracking-widest text-sm shadow-2xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <><Save size={20} /> {editingId ? "Actualizar Menú y Recetas" : "Publicar Nuevo Plato"}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

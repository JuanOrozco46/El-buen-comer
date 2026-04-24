import { CartItem, Table } from "../../types";
import { ShoppingBag, Trash2, ChefHat, AlertTriangle, MessageSquare, MapPin } from "lucide-react";
import { useState } from "react";

interface OrderSummaryProps {
  items: CartItem[];
  role: string | undefined;
  isPanicActive?: boolean;
  selectedTable: Table | null;
  onRemoveItem: (productId: number, sizeId: number) => void;
  onUpdateNotes: (productId: number, sizeId: number, notes: string) => void;
  onClearCart: () => void;
  onPlaceOrder: (paymentType: string) => void;
  isDelivery?: boolean,
  isEditing?: boolean;
}

export const OrderSummary = ({ 
  items, 
  role, 
  isPanicActive, 
  selectedTable, 
  onRemoveItem, 
  onUpdateNotes, 
  onClearCart, 
  onPlaceOrder,
  isDelivery,
  isEditing
}: OrderSummaryProps) => {
  const [editingNotes, setEditingNotes] = useState<string | null>(null); // e.g., "prodId-sizeId"
  const subtotal = items.reduce((sum, item) => sum + (item.size.price * item.quantity), 0);
  const total = subtotal;

  const handleAction = (method: string) => {
    if (isPanicActive) {
      alert("⚠️ MODO PÁNICO ACTIVO: La cocina está saturada. No se pueden procesar nuevos pedidos.");
      return;
    }
    if (!selectedTable && !isDelivery) {
      alert("Por favor selecciona una mesa primero.");
      return;
    }
    if (role === 'WAITER' && method !== 'PENDING') {
      alert("Solo el cajero puede registrar pagos. Pedido enviado a cocina.");
      onPlaceOrder('PENDING');
    } else {
      onPlaceOrder(method);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white p-6 pb-32 md:pb-6 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500 rounded-lg">
            <ShoppingBag size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight leading-none">Comanda</h2>
            {selectedTable && (
              <p className="flex items-center gap-1 text-[10px] text-orange-400 font-black uppercase tracking-widest mt-1">
                <MapPin size={10} /> Mesa {selectedTable.number}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClearCart}
          className="p-2 text-zinc-400 hover:text-red-400 transition-colors"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {isPanicActive && (
        <div className="bg-red-600/20 border border-red-600 p-4 rounded-2xl mb-6 flex items-center gap-4 animate-pulse">
          <AlertTriangle className="text-red-500 shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Cocina Saturada (Pánico)</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6 mb-4 pr-2 custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500 opacity-50 border-2 border-dashed border-zinc-800 rounded-2xl">
            <ShoppingBag size={48} className="mb-4" />
            <p className="font-bold">Carrito vacío</p>
          </div>
        ) : (
          items.map((item) => {
            const itemKey = `${item.product.id}-${item.size.id}`;
            const isEditing = editingNotes === itemKey;

            return (
              <div key={itemKey} className="flex flex-col gap-3 group">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-bold text-zinc-100 group-hover:text-orange-400 transition-colors leading-tight">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mt-1">
                      [{item.size.name}]
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-black text-white">
                      ${(item.size.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Notes Section */}
                {item.notes && !isEditing && (
                  <p className="text-[11px] text-orange-300 italic bg-orange-600/10 p-2 rounded-lg border border-orange-600/20">
                    "{item.notes}"
                  </p>
                )}

                {isEditing ? (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <input
                      autoFocus
                      type="text"
                      value={item.notes || ""}
                      placeholder="Nota: sin cebolla, bien asado..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                      onChange={(e) => onUpdateNotes(item.product.id, item.size.id, e.target.value)}
                      onBlur={() => setEditingNotes(null)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingNotes(null)}
                    />
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setEditingNotes(itemKey)}
                      className="text-[10px] text-zinc-500 hover:text-orange-400 uppercase font-black tracking-widest flex items-center gap-1 transition-colors"
                    >
                      <MessageSquare size={12} /> {item.notes ? "Editar Nota" : "Añadir Nota"}
                    </button>
                    <button
                      onClick={() => onRemoveItem(item.product.id, item.size.id)}
                      className="text-[10px] text-zinc-500 hover:text-red-500 uppercase font-black tracking-widest transition-colors"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-4 border-t border-zinc-800 pt-6">
        <div className="flex justify-between text-2xl font-black text-white pt-2">
          <span>Total</span>
          <span className="text-orange-500">${total.toLocaleString()}</span>
        </div>

        <button
          onClick={() => handleAction('PENDING')}
          disabled={items.length === 0 || isPanicActive}
          className="w-full mt-4 flex flex-col items-center justify-center gap-2 p-6 rounded-[24px] bg-orange-600 hover:bg-orange-500 transition-all font-black tracking-widest uppercase disabled:opacity-50 shadow-xl shadow-orange-600/20 active:scale-95"
        >
          <div className="flex items-center gap-3">
            <ChefHat size={24} />
            <span className="text-lg">
              {isPanicActive ? "Saturado" : (isEditing ? "Actualizar Pedido" : "Enviar a Cocina")}
            </span>
          </div>
          <span className="text-[10px] opacity-70 font-bold tracking-[0.2em]">
            {isDelivery ? "DOMICILIO" : `Mesa ${selectedTable?.number || "?"}`}
          </span>
        </button>
      </div>
    </div>
  );
};

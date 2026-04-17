"use client";

import { CartItem } from "../../types";
import { ShoppingBag, Trash2, CreditCard, Banknote, Smartphone, PieChart, SplitSquareHorizontal, ChefHat, AlertTriangle } from "lucide-react";

interface OrderSummaryProps {
  items: CartItem[];
  role: string | undefined;
  isPanicActive?: boolean;
  onRemoveItem: (productId: number, sizeId: number) => void;
  onClearCart: () => void;
  onPlaceOrder: (paymentType: string) => void;
}

export const OrderSummary = ({ items, role, isPanicActive, onRemoveItem, onClearCart, onPlaceOrder }: OrderSummaryProps) => {
  const subtotal = items.reduce((sum, item) => sum + (item.size.price * item.quantity), 0);
  const total = subtotal;

  const handleAction = (method: string) => {
    if (isPanicActive) {
      alert("⚠️ MODO PÁNICO ACTIVO: La cocina está saturada. No se pueden procesar nuevos pedidos.");
      return;
    }
    // Waiters always send to Kitchen (PENDING) without formal payment yet, 
    // unless they can charge? User said "el cajero debe tener el registro... poner pagar"
    if (role === 'WAITER' && method !== 'PENDING') {
      alert("Solo el cajero puede registrar pagos. Pedido enviado a cocina.");
      onPlaceOrder('PENDING'); // Default to sending order
    } else {
      onPlaceOrder(method);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500 rounded-lg">
            <ShoppingBag size={20} />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight">Comanda</h2>
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

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500 opacity-50 border-2 border-dashed border-zinc-800 rounded-2xl">
            <ShoppingBag size={48} className="mb-4" />
            <p className="font-bold">Carrito vacío</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={`${item.product.id}-${item.size.id}`} className="flex justify-between items-start group">
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
                <button
                  onClick={() => onRemoveItem(item.product.id, item.size.id)}
                  className="text-[11px] text-zinc-500 hover:text-red-500 uppercase font-black tracking-widest mt-2 py-1 transition-colors"
                >
                  Quitar Item
                </button>
              </div>
            </div>
          ))
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
            <span className="text-lg">{isPanicActive ? "Saturado" : "Enviar a Cocina"}</span>
          </div>
          <span className="text-[10px] opacity-70 font-bold tracking-[0.2em]">Copia automática a impresora</span>
        </button>
      </div>
    </div>
  );
};

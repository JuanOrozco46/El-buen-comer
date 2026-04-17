"use client";

import { FullOrder, OrderStatus } from "../../types";
import { Clock, CheckCircle2, PlayCircle, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface OrderCardProps {
  order: FullOrder;
  onStatusChange: (orderId: number, nextStatus: OrderStatus) => void;
}

export const OrderCard = ({ order, onStatusChange }: OrderCardProps) => {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(order.createdAt).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    calculateElapsed();
    const timer = setInterval(calculateElapsed, 1000);
    return () => clearInterval(timer);
  }, [order.createdAt]);

  const getTimeColor = () => {
    const mins = parseInt(elapsed.split(':')[0]);
    if (mins >= 15) return "text-red-500";
    if (mins >= 10) return "text-orange-500";
    return "text-zinc-400";
  };

  const getStatusConfig = () => {
    switch (order.status) {
      case OrderStatus.PENDING:
        return { label: "Pendiente", color: "bg-zinc-100 text-zinc-600", next: OrderStatus.PREPARING, nextLabel: "Comenzar", nextIcon: <PlayCircle size={18} /> };
      case OrderStatus.PREPARING:
        return { label: "Preparando", color: "bg-orange-100 text-orange-600 animate-pulse", next: OrderStatus.COMPLETED, nextLabel: "Finalizar", nextIcon: <CheckCircle2 size={18} /> };
      default:
        return { label: order.status, color: "bg-zinc-100 text-zinc-400", next: null };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex flex-col bg-white rounded-3xl border-2 transition-all duration-500 overflow-hidden shadow-sm ${order.status === OrderStatus.PREPARING ? "border-orange-200" : "border-zinc-100"
      }`}>
      {/* Header */}
      <div className="p-5 flex justify-between items-start border-b border-zinc-50 bg-zinc-50/50">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-zinc-900">#{order.id}</span>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${config.color}`}>
              {config.label}
            </span>
          </div>
          <span className="text-sm font-bold text-zinc-500 mt-1">
            {order.table ? `Mesa ${order.table.number}` : order.customerName || "Cliente"}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 font-mono font-black ${getTimeColor()}`}>
          <Clock size={16} />
          <span>{elapsed}</span>
        </div>
      </div>

      {/* Items */}
      <div className="p-5 flex-1 space-y-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between items-center group">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 flex items-center justify-center bg-zinc-100 rounded-lg text-sm font-black text-zinc-900 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                {item.quantity}
              </span>
              <span className="font-bold text-zinc-800 text-base">
                {item.product.name}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Actions */}
      {config.next && (
        <div className="p-3 bg-zinc-50/50 border-t border-zinc-50">
          <button
            onClick={() => onStatusChange(order.id, config.next!)}
            className={`w-full py-3 flex items-center justify-center gap-2 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 ${order.status === OrderStatus.PENDING
                ? "bg-zinc-900 text-white hover:bg-zinc-800"
                : "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/30"
              }`}
          >
            {config.nextIcon}
            <span>{config.nextLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
};

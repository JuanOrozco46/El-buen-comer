"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Printer, CheckCircle2 } from "lucide-react";

export default function CustomerReceiptPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        if (!res.ok) throw new Error("Orden no encontrada");
        const data = await res.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  useEffect(() => {
    if (!loading && order) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, order]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-zinc-900" size={48} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-white text-zinc-900 px-6 text-center">
        <p className="font-bold text-red-600 mb-4">{error || "No se pudo cargar la orden"}</p>
        <button onClick={() => router.back()} className="px-6 py-3 bg-zinc-100 rounded-xl font-bold text-xs uppercase tracking-widest">
          Volver
        </button>
      </div>
    );
  }

  const dateStr = new Date(order.createdAt).toLocaleString("es-CO", { 
    timeZone: "America/Bogota",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const isPaid = order.status === "PAID";

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #thermal-receipt, #thermal-receipt * { visibility: visible; }
          #thermal-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}} />

      <div className="flex-1 bg-zinc-100 min-h-screen flex flex-col items-center justify-center p-8 relative z-10 print:hidden overflow-y-auto">
        <div className="mb-8 text-center max-w-sm">
          <div className={`inline-flex p-3 rounded-full mb-4 ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
             {isPaid ? <CheckCircle2 size={32} /> : <Printer size={32} />}
          </div>
          <h1 className="text-2xl font-black mb-2">{isPaid ? "Recibo de Venta" : "Pre-cuenta de Mesa"}</h1>
          <p className="text-zinc-500 text-xs">Vista optimizada para la impresora térmica de 58mm.</p>
          
          <div className="flex gap-2 mt-6">
            <button 
              onClick={() => window.print()}
              className="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-[10px]"
            >
              <Printer size={16} /> Imprimir
            </button>
            <button 
              onClick={() => router.back()}
              className="flex-1 bg-white border border-zinc-200 text-zinc-900 font-black py-4 flex items-center justify-center gap-2 rounded-2xl hover:bg-zinc-50 transition-all uppercase tracking-widest text-[10px]"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* RECEIPTS CONTAINER */}
        <div className="bg-white shadow-2xl overflow-hidden" style={{ width: "250px" }}>
          
          <div id="thermal-receipt" className="bg-white text-black p-4 font-mono text-[11px] leading-[1.3]">
            
            {/* Business Header */}
            <div className="text-center mb-4 space-y-1">
              <h2 className="font-extrabold text-[18px] uppercase tracking-tighter">EL BUEN COMER</h2>
              <p className="text-[10px] font-bold">Arrocería & Grill</p>
              <p className="text-[9px]">Calle Ficticia #123 - Bogotá</p>
              <p className="text-[9px]">Tel: 300 000 0000</p>
            </div>

            <div className="border-t border-black border-dashed my-2" />

            {/* Order Info */}
            <div className="text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Orden:</span>
                <span className="font-bold">#{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Fecha:</span>
                <span>{dateStr}</span>
              </div>
              <div className="flex justify-between">
                <span>Cliente:</span>
                <span className="font-bold">{order.customerName || order.table?.number || "General"}</span>
              </div>
              <div className="flex justify-between">
                <span>Cajero:</span>
                <span>{order.user?.name}</span>
              </div>
            </div>

            <div className="border-t border-black border-dashed my-2" />

            {/* Items Table Header */}
            <div className="flex justify-between font-bold text-[10px] mb-1">
              <span className="w-8">Cant</span>
              <span className="flex-1">Producto</span>
              <span className="w-16 text-right">Total</span>
            </div>

            {/* Items List */}
            <div className="space-y-1">
              {order.items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-start text-[10px]">
                  <span className="w-8">[{item.quantity}]</span>
                  <div className="flex-1 flex flex-col">
                    <span className="uppercase">{item.product.name}</span>
                    <span className="text-[9px] opacity-70">({item.sizeName})</span>
                  </div>
                  <span className="w-16 text-right font-bold">
                    ${(Number(item.price) * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-black border-dashed mt-4 mb-2" />

            {/* Totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-[14px]">
                <span className="font-black">TOTAL:</span>
                <span className="font-black">${Number(order.total).toLocaleString()}</span>
              </div>
              
              {isPaid && order.payments && order.payments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-black border-dotted">
                   <p className="text-[9px] font-bold uppercase mb-1">Pagado con:</p>
                   {order.payments.map((p: any, idx: number) => (
                     <div key={idx} className="flex justify-between text-[10px]">
                        <span className="uppercase">{p.method}</span>
                        <span>${Number(p.amount).toLocaleString()}</span>
                     </div>
                   ))}
                </div>
              )}
            </div>

            <div className="border-t border-black border-dashed mt-4 mb-2" />

            {/* Footer */}
            <div className="text-center text-[10px] space-y-1">
              {!isPaid && (
                <p className="font-black border border-black p-1 uppercase mb-2">*** PRE-CUENTA ***</p>
              )}
              <p className="font-bold">¡Gracias por tu compra!</p>
              <p className="text-[9px]">Siguenos en @elbuencomer</p>
              <div className="mt-4 opacity-50 text-[8px]">
                <p>Software Powered by Antigravity</p>
                <p>{new Date().getFullYear()}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

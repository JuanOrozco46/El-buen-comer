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
          /* Hide everything outside the receipt */
          body * {
            display: none !important;
          }
          /* Show only the receipt and its content */
          html, body, #thermal-receipt, #thermal-receipt * {
            display: block !important;
            visibility: visible !important;
          }
          #thermal-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm;
            margin: 0;
            padding: 4mm;
            background: white;
            color: black;
          }
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}} />

      {/* WEB VIEW / PREVIEW */}
      <div className="flex-1 bg-zinc-100 min-h-screen flex flex-col items-center justify-center p-8 relative z-10 print:hidden overflow-y-auto">
        <div className="mb-8 text-center max-w-sm">
          <div className={`inline-flex p-4 rounded-3xl mb-4 shadow-xl ${isPaid ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-amber-500 text-white shadow-amber-500/20'}`}>
             {isPaid ? <CheckCircle2 size={32} strokeWidth={3} /> : <Printer size={32} strokeWidth={3} />}
          </div>
          <h1 className="text-2xl font-black mb-1 tracking-tight">{isPaid ? "Recibo de Pago" : "Pre-cuenta"}</h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Orden #{order.id}</p>
          
          <div className="flex flex-col gap-3 mt-8">
            <button 
              onClick={() => window.print()}
              className={`w-full font-black py-5 rounded-[24px] flex items-center justify-center gap-3 shadow-xl transition-all uppercase tracking-widest text-xs ${isPaid ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20' : 'bg-amber-600 text-white hover:bg-amber-500 shadow-amber-600/20'}`}
            >
              <Printer size={20} /> Imprimir Recibo
            </button>
            <button 
              onClick={() => router.back()}
              className="w-full bg-white border border-zinc-200 text-zinc-900 font-black py-4 flex items-center justify-center gap-2 rounded-[24px] hover:bg-zinc-50 transition-all uppercase tracking-widest text-[10px]"
            >
              Volver al Terminal
            </button>
          </div>
        </div>

        {/* RECEIPT PREVIEW */}
        <div className="bg-white shadow-2xl rounded-3xl overflow-hidden border border-zinc-200" style={{ width: "280px" }}>
          
          <div id="thermal-receipt" className="bg-white text-black p-5 font-mono text-[11px] leading-tight">
            
            {/* Header */}
            <div className="text-center mb-6 border-b-2 border-black border-dashed pb-4">
              <h2 className="font-black text-[20px] uppercase tracking-tighter">EL BUEN COMER</h2>
              <p className="text-[10px] font-bold mt-1 opacity-70 italic">Sabor que te hace volver</p>
            </div>

            {/* Order Info */}
            <div className="text-[11px] space-y-1 font-bold mb-4">
              <div className="flex justify-between">
                <span>ORDEN:</span>
                <span>#{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span className="text-right">{dateStr}</span>
              </div>
              <div className="flex justify-between">
                <span>MESA/REF:</span>
                <span className="font-black truncate max-w-[120px]">{order.table?.number || order.customerName || "GENERAL"}</span>
              </div>
              <div className="flex justify-between opacity-70">
                <span>CAJERO:</span>
                <span className="truncate">{order.user?.name}</span>
              </div>
            </div>

            <div className="border-t-2 border-black border-dashed my-4" />

            {/* Items Table */}
            <div className="space-y-3 mb-6">
              {order.items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-start text-[11px]">
                  <span className="font-black">[{item.quantity}]</span>
                  <div className="flex-1 px-2 flex flex-col">
                    <span className="uppercase font-bold">{item.product.name}</span>
                    <span className="text-[9px] opacity-70">{item.sizeName}</span>
                  </div>
                  <span className="font-black text-right">
                    ${(Number(item.price) * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-black border-dashed pt-4 space-y-2">
              <div className="flex justify-between text-[18px] font-black">
                <span>TOTAL:</span>
                <span>${Number(order.total).toLocaleString()}</span>
              </div>
              
              {isPaid && order.payments && order.payments.length > 0 && (
                <div className="mt-4 pt-3 border-t-2 border-black border-dotted space-y-1">
                   {order.payments.map((p: any, idx: number) => (
                     <div key={idx} className="flex justify-between text-[11px] font-bold">
                        <span className="uppercase">{p.method}</span>
                        <span>${Number(p.amount).toLocaleString()}</span>
                     </div>
                   ))}
                </div>
              )}
            </div>

            <div className="border-t-2 border-black border-dashed mt-6 pt-4 text-center">
              {!isPaid && (
                <p className="font-black border-4 border-black p-2 uppercase text-[14px] mb-4">*** PRE-CUENTA ***</p>
              )}
              <h3 className="font-black text-[14px] mb-1">¡GRACIAS POR TU COMPRA!</h3>
              <p className="text-[10px] font-bold opacity-60">Software: El Buen Comer POS</p>
              <p className="text-[10px] font-bold opacity-60">Visítanos pronto</p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

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
        // Cierra la ventana/pestaña después de imprimir
        setTimeout(() => window.close(), 500);
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
    <div className="bg-zinc-50 flex flex-col items-center justify-center p-4 print:p-0 print:block print:bg-white min-h-screen print:min-h-0">
      <style dangerouslySetInnerHTML={{ __html: `
        @media screen {
          #print-area { display: none; }
        }
        @media print {
          html, body {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          /* Hide everything except the print area */
          body > *:not(#print-area), 
          header, 
          nav, 
          aside, 
          footer,
          .print\:hidden {
            display: none !important;
          }
          #print-area {
            display: block !important;
            visibility: visible !important;
            width: 58mm;
            padding: 2mm;
            background: white;
            margin: 0;
            position: absolute;
            left: 0;
            top: 0;
          }
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}} />

      {/* WEB VIEW / PREVIEW */}
      <div className="print:hidden flex flex-col items-center gap-8 animate-in fade-in duration-500">
        <div className="text-center max-w-sm">
          <div className={`inline-flex p-4 rounded-3xl mb-4 shadow-xl ${isPaid ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-amber-500 text-white shadow-amber-500/20'}`}>
             {isPaid ? <CheckCircle2 size={32} strokeWidth={3} /> : <Printer size={32} strokeWidth={3} />}
          </div>
          <h1 className="text-2xl font-black mb-1 tracking-tight">{isPaid ? "Recibo de Pago" : "Pre-cuenta"}</h1>
          <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Orden #{order.id}</p>
          
          <div className="flex flex-col gap-3 mt-8">
            <button 
              onClick={() => window.print()}
              className={`w-80 font-black py-5 rounded-[24px] flex items-center justify-center gap-3 shadow-xl transition-all uppercase tracking-widest text-xs active:scale-95 ${isPaid ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20' : 'bg-amber-600 text-white hover:bg-amber-500 shadow-amber-600/20'}`}
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

        {/* Mockup visual */}
        <div className="bg-white shadow-2xl rounded-[40px] border border-zinc-100 overflow-hidden" style={{ width: "280px" }}>
          <div className="p-8 bg-zinc-50 border-b border-zinc-100">
             <div className="w-full h-1 bg-zinc-200 rounded-full mb-1 opacity-50" />
             <div className="w-2/3 h-1 bg-zinc-200 rounded-full opacity-50" />
          </div>
          <div className="p-6">
             <div className="text-center mb-6">
                <h2 className="font-black text-xl uppercase tracking-tighter">EL BUEN COMER</h2>
                <p className="text-[10px] font-bold opacity-50">Comprobante de Venta</p>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase text-zinc-400">
                   <span>Orden #{order.id}</span>
                   <span>${Number(order.total).toLocaleString()}</span>
                </div>
                <div className="border-t border-zinc-100 pt-4">
                   <p className="text-center font-black text-xs text-zinc-900 uppercase tracking-widest">¡Gracias por preferirnos!</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* PRINT AREA */}
      <div id="print-area">
        <div className="bg-white text-black font-mono leading-tight p-2" style={{ fontSize: "12px" }}>
          <div className="text-center mb-6 border-b-2 border-black border-dashed pb-4">
            <h2 className="font-black text-[20px] uppercase tracking-tighter">EL BUEN COMER</h2>
            <p className="text-[10px] font-bold mt-1 opacity-70 italic">Sabor que te hace volver</p>
          </div>

          <div className="text-[11px] font-bold mb-4 space-y-1">
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
          </div>

          <div className="border-t-2 border-black border-dashed my-4" />

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
            <h3 className="font-black text-[14px] mb-1 uppercase tracking-tight">¡Gracias por tu compra!</h3>
            <p className="text-[10px] font-bold opacity-60">Visítanos pronto</p>
          </div>
        </div>
      </div>
    </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";

export default function KitchenPrintTicket() {
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
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, order, router]);

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
          /* Hide specific structural elements to avoid overriding generic wrappers */
          header, nav, aside, footer, .print\:hidden {
            display: none !important;
          }
          #print-area {
            display: block !important;
            width: 58mm;
            padding: 2mm;
            background: white;
            margin: 0 auto;
            color: #000 !important;
            -webkit-font-smoothing: none !important;
            -moz-osx-font-smoothing: unset !important;
            font-family: Arial, Helvetica, sans-serif !important;
            text-shadow: none !important;
          }
          @page {
            size: 58mm auto;
            margin: 0;
          }
        }
      `}} />

      {/* WEB PREVIEW */}
      <div className="print:hidden flex flex-col items-center gap-8 animate-in fade-in duration-500">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Printer size={32} />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Impresión de Comanda</h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Orden #{order.id}</p>
          
          <div className="mt-8 flex flex-col gap-3">
            <button 
              onClick={() => window.print()}
              className="w-80 bg-orange-600 text-white font-black py-5 rounded-[24px] flex items-center justify-center gap-3 shadow-xl shadow-orange-600/20 hover:bg-orange-500 active:scale-95 transition-all uppercase tracking-widest text-xs"
            >
              <Printer size={20} /> Imprimir Ahora
            </button>
            <button 
              onClick={() => router.back()}
              className="w-full bg-white border border-zinc-200 text-zinc-900 font-black py-4 flex items-center justify-center gap-2 rounded-[24px] hover:bg-zinc-50 transition-all uppercase tracking-widest text-[10px]"
            >
              Volver al POS
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
             <div className="mx-auto border-4 border-zinc-900 text-zinc-900 p-2 text-center mb-6">
                <span className="font-black text-xl uppercase italic">COPIA COCINA</span>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase text-zinc-400">
                   <span>Mesa {order.table?.number || "?"}</span>
                   <span>#{order.id}</span>
                </div>
                <div className="space-y-3">
                   {order.items.slice(0, 3).map((it: any) => (
                      <div key={it.id} className="flex gap-3">
                         <span className="font-black text-orange-600">[{it.quantity}]</span>
                         <span className="font-bold text-zinc-800 uppercase text-xs truncate">{it.product.name}</span>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* PRINT AREA */}
      <div id="print-area">
        <div className="bg-white text-black font-mono leading-tight p-2" style={{ fontSize: "14px" }}>
          <div className="text-center mb-4 border-b-8 border-black pb-4">
            <h2 className="font-black text-[24px] uppercase mb-1">COMANDA COCINA</h2>
            <div className="border-[6px] border-black p-1 my-2">
              {order.source === 'DELIVERY' || order.customerAddress ? (
                <div className="flex flex-col items-center">
                  <div className="bg-black text-white w-full py-2">
                    <p className="font-black text-[28px] leading-none text-center tracking-widest">DOMICILIO</p>
                  </div>
                  <div className="w-full text-left font-black text-[13px] pt-2 mt-1 break-inside-avoid space-y-1">
                    {order.customerName && <p>CLI: {order.customerName}</p>}
                    {order.customerPhone && <p>TEL: {order.customerPhone}</p>}
                    {order.customerAddress && <p>DIR: {order.customerAddress}</p>}
                    {order.notes && <p className="uppercase">{order.notes}</p>}
                  </div>
                </div>
              ) : (
                <p className="font-black text-[42px] leading-none text-center">
                  MESA {order.table?.number || "S/N"}
                </p>
              )}
            </div>
            <p className="mt-2 font-black text-[20px]">ORDEN #{order.id}</p>
          </div>

          <div className="mb-4 text-[13px] font-black space-y-1">
            <div className="flex justify-between">
              <span>FECHA:</span>
              <span>{dateStr.split(",")[0]}</span>
            </div>
            <div className="flex justify-between">
              <span>HORA:</span>
              <span>{dateStr.split(",")[1]?.trim()}</span>
            </div>
            <div className="flex justify-between underline">
              <span>MESERO:</span>
              <span>{order.user?.name || "PERSONAL"}</span>
            </div>
          </div>

          <div className="border-t-2 border-black border-dashed mb-4" />

          <div className="space-y-8 mb-8">
            {order.items.map((item: any) => (
              <div key={item.id} className="flex flex-col border-b-2 border-black pb-2">
                <div className="flex items-start gap-4">
                  <span className="text-[48px] font-black border-[6px] border-black px-4 py-1 leading-none">
                    {item.quantity}
                  </span>
                  <div className="flex flex-col flex-1">
                    <span className="uppercase text-[20px] font-black leading-tight">
                      {item.product.name}
                    </span>
                    <span className="text-[14px] font-black mt-1">
                      {item.sizeName}
                    </span>
                  </div>
                </div>
                {item.notes && (
                  <div className="mt-4 p-3 border-4 border-black bg-white">
                    <p className="text-[12px] font-black uppercase mb-1 underline">INSTRUCCIÓN ESPECIAL:</p>
                    <p className="text-[20px] font-black leading-tight uppercase">
                      *** {item.notes} ***
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t-2 border-black border-dashed mb-4" />
          <div className="text-center font-black mt-4">
            <p className="text-[14px] tracking-[0.3em]">--- FIN ---</p>
          </div>
        </div>
      </div>
    </div>
    );
}

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
    // Si carga correctamente, lanzamos la impresión y al terminar podemos volver atrás.
    if (!loading && order) {
      const timer = setTimeout(() => {
        window.print();
        // Opcional: cerrar ventana o volver si fue abierta por un POS action
        // router.back();
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
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          /* Hide everything outside the ticket */
          body * {
            display: none !important;
          }
          /* Show only the ticket and its content */
          html, body, #thermal-ticket, #thermal-ticket * {
            display: block !important;
            visibility: visible !important;
          }
          #thermal-ticket {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm; /* Standard thermal width */
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
          <h1 className="text-2xl font-black mb-2 tracking-tight">Impresión de Comanda</h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Orden #{order.id}</p>
          
          <div className="mt-8 flex flex-col gap-3">
            <button 
              onClick={() => window.print()}
              className="w-full bg-orange-600 text-white font-black py-5 rounded-[24px] flex items-center justify-center gap-3 shadow-xl shadow-orange-600/20 hover:bg-orange-500 transition-all uppercase tracking-widest text-xs"
            >
              <Printer size={20} /> Imprimir Comanda
            </button>
            <button 
              onClick={() => router.back()}
              className="w-full bg-white border border-zinc-200 text-zinc-900 font-black py-4 flex items-center justify-center gap-2 rounded-[24px] hover:bg-zinc-50 transition-all uppercase tracking-widest text-[10px]"
            >
              Cerrar y Volver
            </button>
          </div>
        </div>

        {/* CONTAINER PREVIEW (250px is close to 58mm) */}
        <div className="bg-white shadow-2xl rounded-3xl overflow-hidden border border-zinc-200" style={{ width: "280px" }}>
          <div id="thermal-ticket" className="bg-white text-black p-5 font-mono text-[12px] leading-tight">
            
            {/* Header */}
            <div className="text-center mb-6 border-b-2 border-black border-dashed pb-4">
              <h2 className="font-black text-[18px] uppercase tracking-tighter mb-1">COMANDA</h2>
              <p className="font-bold text-[14px]">#{order.id}</p>
              {order.table && (
                <p className="mt-2 bg-black text-white px-2 py-1 inline-block text-[14px] font-black">
                  MESA {order.table.number}
                </p>
              )}
            </div>

            {/* Meta Info */}
            <div className="mb-6 text-[11px] space-y-1 font-bold">
              <div className="flex justify-between">
                <span>FECHA:</span>
                <span>{dateStr.split(",")[0]}</span>
              </div>
              <div className="flex justify-between">
                <span>HORA:</span>
                <span>{dateStr.split(",")[1]?.trim()}</span>
              </div>
              <div className="flex justify-between">
                <span>MESERO:</span>
                <span className="truncate">{order.user?.name || "PERSONAL"}</span>
              </div>
            </div>

            <div className="border-t-2 border-black border-dashed mb-4" />

            {/* Items with emphasis on quantity */}
            <div className="space-y-6 mb-8">
              {order.items.map((item: any) => (
                <div key={item.id} className="flex flex-col">
                  <div className="flex items-start gap-3">
                    <span className="text-[20px] font-black border-2 border-black px-2 leading-none">
                      {item.quantity}
                    </span>
                    <div className="flex flex-col flex-1">
                      <span className="uppercase text-[14px] font-black leading-tight">
                        {item.product.name}
                      </span>
                      <span className="text-[11px] font-bold opacity-70 mt-1">
                        [{item.sizeName}]
                      </span>
                    </div>
                  </div>
                  
                  {/* Important Notes */}
                  {item.notes && (
                    <div className="mt-2 ml-10 p-2 border-2 border-black border-dotted bg-zinc-50">
                      <p className="text-[10px] font-black uppercase mb-1">Petición Especial:</p>
                      <p className="text-[12px] font-bold italic leading-tight uppercase">
                        *** {item.notes} ***
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t-2 border-black border-dashed mb-4" />

            <div className="text-center text-[10px] mt-2 font-black">
              <p className="tracking-[0.2em] mb-4">--- FIN DE COMANDA ---</p>
              <p>EL BUEN COMER</p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

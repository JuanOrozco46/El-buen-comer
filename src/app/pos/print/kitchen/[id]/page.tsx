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
        /* Hide everything by default for print */
        @media print {
          body * {
            visibility: hidden;
          }
          /* Show only the ticket */
          #thermal-ticket, #thermal-ticket * {
            visibility: visible;
          }
          #thermal-ticket {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          @page {
            /* General thermal printer width */
            size: 58mm auto;
            margin: 0;
          }
          nav {
            display: none !important;
          }
        }
      `}} />

      {/* VISTA DE PUESTA A PUNTO (Para que el usuario lo vea en la web normal antes de imprimir) */}
      <div className="flex-1 bg-zinc-100 min-h-screen flex flex-col items-center justify-center p-8 relative z-10 print:hidden overflow-y-auto">
        <div className="mb-8 text-center max-w-sm">
          <h1 className="text-2xl font-black mb-2">Simulador de Tirilla SAT 22TUE</h1>
          <p className="text-zinc-500 text-xs">Así es exactamente como se enviará a la impresora de cocina de forma automática.</p>
          <button 
            onClick={() => window.print()}
            className="mt-6 w-full bg-zinc-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:bg-zinc-800 transition-all uppercase tracking-widest text-[10px]"
          >
            <Printer size={16} /> Forzar Impresión de Prueba
          </button>
          <button 
            onClick={() => router.back()}
            className="mt-3 w-full bg-white border border-zinc-200 text-zinc-900 font-black py-4 flex items-center justify-center gap-2 rounded-2xl hover:bg-zinc-50 transition-all uppercase tracking-widest text-[10px]"
          >
            Volver al POS
          </button>
        </div>

        {/* CONTENEDOR 58mm (aprox 220px/250px en web) */}
        <div className="bg-white shadow-2xl overflow-hidden" style={{ width: "250px" }}>
          
          {/* Aquí inicia el ticket real */}
          <div id="thermal-ticket" className="bg-white text-black p-3 font-mono text-[11px] leading-[1.2]">
            
            {/* Header */}
            <div className="text-center mb-4 border-b border-black border-dashed pb-2">
              <h2 className="font-extrabold text-[16px] uppercase tracking-tighter mb-1">COMANDA COCINA</h2>
              <p className="font-bold">ORDEN #{order.id}</p>
            </div>

            {/* Meta */}
            <div className="mb-4 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span>Fecha:</span>
                <span>{dateStr.split(",")[0]}</span>
              </div>
              <div className="flex justify-between">
                <span>Hora:</span>
                <span>{dateStr.split(",")[1]?.trim()}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Mesa/Cliente:</span>
                <span className="text-right truncate max-w-[120px]">{order.table?.number || order.customerName || "S/N"}</span>
              </div>
              <div className="flex justify-between">
                <span>Tomado por:</span>
                <span className="truncate max-w-[100px]">{order.user?.name || "Bot/Auto"}</span>
              </div>
            </div>

            <div className="border-t border-black border-dashed mb-2" />

            {/* Items */}
            <div className="space-y-4 mb-4">
              {order.items.map((item: any) => (
                <div key={item.id} className="font-bold">
                  {/* Quantity and Name */}
                  <div className="flex gap-2">
                    <span className="text-[14px]">[{item.quantity}]</span>
                    <span className="uppercase text-[12px]">{item.product.name}</span>
                  </div>
                  {/* Options / Sizes underneath */}
                  <div className="pl-6 text-[10px] mt-1 space-y-1">
                    <p className="opacity-80">{"->"} Tamaño: {item.sizeName}</p>
                    {/* Placeholder for custom notes if they exist */}
                    {item.notes && <p className="opacity-80 break-words">{"->"} Nota: {item.notes}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-black border-dashed mb-2" />

            {/* Footer */}
            <div className="text-center text-[9px] mt-4 pt-1 mb-8">
              <p>------------- FIN -------------</p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Printer, CheckCircle2 } from "lucide-react";

function InvoicePrintContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const customerName = searchParams.get("name") || "";
  const customerNit = searchParams.get("nit") || "";
  const customerAddress = searchParams.get("address") || "";
  const customerPhone = searchParams.get("phone") || "";

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
          header, nav, aside, footer, .print\:hidden {
            display: none !important;
          }
          #print-area {
            display: block !important;
            width: 80mm;
            padding: 4mm;
            background: white;
            margin: 0 auto;
            color: #000 !important;
            font-family: 'Courier New', Courier, monospace !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}} />

      <div className="print:hidden flex flex-col items-center gap-4 text-center">
        <div className="p-4 bg-zinc-900 text-white rounded-3xl">
           <Printer size={32} />
        </div>
        <h1 className="text-2xl font-black">Vista Previa de Factura</h1>
        <p className="text-zinc-500 text-xs">Preparando impresión para: <b>{customerName}</b></p>
        <button onClick={() => window.print()} className="mt-4 bg-zinc-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs"> Imprimir Ahora </button>
      </div>

      <div id="print-area">
        <div className="text-center mb-6 border-b-2 border-black pb-4">
          <h1 className="text-xl font-black uppercase">EL BUEN COMER</h1>
          <p className="text-[12px] font-bold">NIT: 25163221</p>
          <p className="text-[10px] mt-1 font-bold">Factura de Venta No. {order.id}</p>
        </div>

        <div className="text-[11px] space-y-1 mb-4">
          <div className="flex justify-between">
            <span className="font-bold">FECHA:</span>
            <span>{dateStr}</span>
          </div>
          <div className="border border-black p-2 space-y-1 bg-zinc-50">
             <p className="font-black uppercase text-center border-b border-black mb-1 pb-1">DATOS DEL CLIENTE</p>
             <p><b>R. SOCIAL:</b> {customerName}</p>
             <p><b>NIT/CC:</b> {customerNit}</p>
             {customerAddress && <p><b>DIR:</b> {customerAddress}</p>}
             {customerPhone && <p><b>TEL:</b> {customerPhone}</p>}
          </div>
        </div>

        <div className="border-t border-black my-4" />

        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left font-black pb-2">CANT</th>
              <th className="text-left font-black pb-2">PRODUCTO</th>
              <th className="text-right font-black pb-2">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item: any) => (
              <tr key={item.id} className="border-b border-zinc-100">
                <td className="py-2 font-bold">[{item.quantity}]</td>
                <td className="py-2">
                  <div className="flex flex-col">
                    <span className="font-black uppercase">{item.product.name}</span>
                    <span className="text-[9px]">{item.sizeName}</span>
                  </div>
                </td>
                <td className="py-2 text-right font-black">${(Number(item.price) * item.quantity).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 border-t-2 border-black pt-4 space-y-1">
          <div className="flex justify-between text-[12px] font-bold">
            <span>SUBTOTAL:</span>
            <span>${Number(order.total).toLocaleString()}</span>
          </div>
          {Number(order.deliveryFee || 0) > 0 && (
            <div className="flex justify-between text-[12px] font-bold">
              <span>DOMICILIO:</span>
              <span>${Number(order.deliveryFee).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-[16px] font-black border-t border-black pt-2">
            <span>TOTAL:</span>
            <span>${(Number(order.total) + Number(order.deliveryFee || 0)).toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-8 text-center text-[10px] font-bold uppercase italic border-t border-dotted border-black pt-4">
           ¡Gracias por su compra!
           <br />
           Esta factura se emite para fines de soporte comercial.
        </div>
      </div>
    </div>
  );
}

export default function InvoicePrintPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-zinc-900" size={48} />
      </div>
    }>
      <InvoicePrintContent />
    </Suspense>
  );
}

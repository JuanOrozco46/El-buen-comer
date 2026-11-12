"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { FullOrder } from "../../types";

export function AutoPrintListener() {
  const { data: session, status } = useSession();
  const printedOrderIds = useRef<Set<number>>(new Set());
  const isFirstFetch = useRef(true);

  const fetchOrders = async () => {
    if (status !== "authenticated" || !["ADMIN", "CASHIER"].includes(session?.user?.role || "")) return;

    try {
      const res = await fetch("/api/orders?status=active");
      if (res.ok) {
        const data: FullOrder[] = await res.json();

        if (isFirstFetch.current) {
          // On first run, mark existing as printed to avoid a storm of papers
          data.forEach((o) => printedOrderIds.current.add(o.id));
          isFirstFetch.current = false;
        } else {
          // Detect new orders and trigger auto-print
          data.forEach((o) => {
            if (!printedOrderIds.current.has(o.id)) {
              printedOrderIds.current.add(o.id);
              // Small delay to ensure browser handles the window.open correctly
              setTimeout(() => {
                window.open(`/pos/print/kitchen/${o.id}`, "_blank");
                if (o.source === 'DELIVERY') {
                  setTimeout(() => window.open(`/pos/print/receipt/${o.id}`, "_blank"), 500);
                }
              }, 300);
            }
          });
        }
      }
    } catch (error) {
      console.error("Error in auto-print listener:", error);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    
    // Check if current user is supposed to be the "Print Station"
    const isPrintStation = ["ADMIN", "CASHIER"].includes(session?.user?.role || "");
    if (!isPrintStation) return;

    fetchOrders();
    const interval = setInterval(fetchOrders, 3000); // Poll every 3s

    // WhatsApp Keep-Alive & Auto-Heal Watchdog (every 2 minutes)
    const pingWhatsApp = () => {
      fetch("/api/admin/whatsapp").catch(() => {});
    };
    pingWhatsApp();
    const waInterval = setInterval(pingWhatsApp, 120000);

    return () => {
      clearInterval(interval);
      clearInterval(waInterval);
    };
  }, [status, session]);

  return null; // Invisible component
}

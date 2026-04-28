"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Product, ProductSize, CartItem, OrderSource, FullOrder, Table } from "../../types";
import { ProductCard } from "../../components/pos/ProductCard";
import { OrderSummary } from "../../components/pos/OrderSummary";
import { TableMap } from "../../components/pos/TableMap";
import { DeliveryModal } from "../../components/pos/DeliveryModal";
import { Search, Loader2, ListOrdered, PlusCircle, ShoppingCart, X, DollarSign, Smartphone, Banknote, Printer, ChefHat, ChevronLeft, CheckCircle2, ShoppingBag } from "lucide-react";
import { TakeawayModal } from "../../components/pos/TakeawayModal";

export default function POSPage() {
  const { data: session, status } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingOrders, setPendingOrders] = useState<FullOrder[]>([]);
  const [salesSummary, setSalesSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  // Tab control: 'NEW' for placing orders, 'PENDING' for cashing out, 'SUMMARY' for shift stats
  const [viewMode, setViewMode] = useState<'NEW' | 'PENDING' | 'SUMMARY'>('NEW');
  
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "summary") setViewMode('SUMMARY');
    else if (v === "pending") setViewMode('PENDING');
    else setViewMode('NEW');
  }, [searchParams]);
  const [viewStep, setViewStep] = useState<'TABLE' | 'PRODUCTS'>('TABLE');
  const [isPanicActive, setIsPanicActive] = useState(false);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);

  // Split payment modal state
  const [splitModal, setSplitModal] = useState<{ orderId: number; total: number } | null>(null);
  const [splitCash, setSplitCash] = useState("");
  const [splitTransfer, setSplitTransfer] = useState("");

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryData, setDeliveryData] = useState<{name: string, phone: string, address: string, method: string, fee: number} | null>(null);

  // Takeaway state
  const [showTakeawayModal, setShowTakeawayModal] = useState(false);
  const [takeawayData, setTakeawayData] = useState<{name: string, phone: string, method: string} | null>(null);

  // Receipt prompt modal
  const [receiptModal, setReceiptModal] = useState<{ orderId: number; paidWith?: string; change?: string } | null>(null);

  // Cash calculation modal state
  const [cashModal, setCashModal] = useState<{ orderId: number; total: number } | null>(null);
  const [cashPaidWith, setCashPaidWith] = useState("");

  // Effect 1: Panic Mode Polling
  useEffect(() => {
    const checkPanic = async () => {
      try {
        const res = await fetch('/api/admin/panic');
        const json = await res.json();
        setIsPanicActive(json.isPanicModeActive);
      } catch (err) { console.error(err); }
    };
    checkPanic();
    const interval = setInterval(checkPanic, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  // Effect 2: Initial Data Fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [prodRes, ordRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/orders?status=active')
        ]);
        const pData = await prodRes.json();
        const oData = await ordRes.json();
        setProducts(pData);
        if (Array.isArray(oData)) {
          setPendingOrders(oData.filter(o => o.status !== "PAID"));
        }
      } catch (error) {
        console.error("Error fetching POS data:", error);
      } finally {
        setLoading(false);
      }
    };
    if (status === "authenticated") {
      fetchInitialData();
      // Setup polling for live updates of pending orders from other devices
      const interval = setInterval(refreshOrders, 3000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const categories = ["Todos", ...Array.from(new Set(products.map(p => p.category)))];

  const addToCart = (product: Product, size: ProductSize) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.size.id === size.id);
      if (existing) {
        return prev.map(item =>
          (item.product.id === product.id && item.size.id === size.id)
            ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, size, quantity: 1, notes: "" }];
    });
    // On mobile, show feedback or open cart?
  };

  const updateCartItemNotes = (productId: number, sizeId: number, notes: string) => {
    setCart(prev => prev.map(item => 
      (item.product.id === productId && item.size.id === sizeId)
        ? { ...item, notes } : item
    ));
  };

  const removeFromCart = (productId: number, sizeId: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === productId && item.size.id === sizeId);
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          (item.product.id === productId && item.size.id === sizeId)
            ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter(item => !(item.product.id === productId && item.size.id === sizeId));
    });
  };

  const clearCart = () => {
    setCart([]);
    setSelectedTable(null);
    setDeliveryData(null);
    setTakeawayData(null);
    setEditOrderId(null);
    setViewStep('TABLE');
  };

  const refreshOrders = async () => {
    try {
      const [ordRes, sumRes] = await Promise.all([
        fetch('/api/orders?status=active'),
        fetch('/api/orders/summary')
      ]);
      const oData = await ordRes.json();
      const sData = await sumRes.json();
      if (Array.isArray(oData)) setPendingOrders(oData);
      if (Array.isArray(sData)) setSalesSummary(sData);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  const placeOrder = async (actionMethod: string) => {
    try {
      if (!selectedTable && !deliveryData && !takeawayData) return alert("Selecciona una mesa, domicilio o para llevar");
      if (cart.length === 0) return alert("Agrega al menos un producto al pedido");

      const subtotal = cart.reduce((s, i) => s + (i.size.price * i.quantity), 0);
      const deliveryFee = deliveryData?.fee || 0;
      // Real total for the restaurant is just subtotal
      const total = subtotal;

      const orderData = {
        source: takeawayData ? OrderSource.TAKEAWAY : (deliveryData ? OrderSource.DELIVERY : OrderSource.POS),
        tableId: selectedTable ? selectedTable.id : null,
        customerName: takeawayData?.name || deliveryData?.name || null,
        customerPhone: takeawayData?.phone || deliveryData?.phone || null,
        customerAddress: deliveryData?.address || null,
        notes: null,
        total: total,
        deliveryFee: deliveryFee,
        status: actionMethod === 'PENDING' ? 'PENDING' : 'COMPLETED',
        payments: actionMethod === 'PENDING' ? [] : [{ method: actionMethod, amount: subtotal }],
        items: cart.map(item => ({
          productId: item.product.id,
          sizeName: item.size.name,
          quantity: item.quantity,
          price: item.size.price,
          notes: item.notes
        }))
      };

      const res = await fetch(editOrderId ? `/api/orders/${editOrderId}` : '/api/orders', {
        method: editOrderId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        clearCart();
        setShowMobileSummary(false);
        await refreshOrders();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'No se pudo realizar el pedido.'}`);
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  const deleteOrder = async (orderId: number) => {
    if (!confirm("¿Estás seguro de que deseas ELIMINAR esta comanda? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await refreshOrders();
      } else {
        alert("No se pudo eliminar la orden.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEditingOrder = async (orderId: number, table: any) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error();
      const orderData = await res.json();
      
      // Load items into cart
      const cartItems: CartItem[] = orderData.items.map((i: any) => ({
        product: i.product,
        size: i.product.sizes.find((s: any) => s.name === i.sizeName) || { id: 0, name: i.sizeName, price: i.price },
        quantity: i.quantity,
        notes: i.notes || ""
      }));
      
      setCart(cartItems);
      setEditOrderId(orderId);
      setSelectedTable(table);
      
      // If it's a delivery/takeaway, set the specific data for the summary
      if (orderData.source === 'DELIVERY') {
        setDeliveryData({ 
          name: orderData.customerName || "", 
          phone: orderData.customerPhone || "", 
          address: orderData.customerAddress || "", 
          method: "", 
          fee: orderData.deliveryFee || 0 
        });
      } else if (orderData.source === 'TAKEAWAY') {
        setTakeawayData({ 
          name: orderData.customerName || "", 
          phone: orderData.customerPhone || "", 
          method: "" 
        });
      }

      setViewStep('PRODUCTS');
    } catch (err) {
      alert("Error al cargar la orden para edición.");
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (orderId: number, method: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID", paymentMethod: method })
      });
      if (res.ok) {
        setPendingOrders(prev => prev.filter(o => o.id !== orderId));
        const paid = cashModal ? cashPaidWith : undefined;
        const veltas = cashModal ? Math.max(0, (parseFloat(cashPaidWith) || 0) - cashModal.total).toString() : undefined;
        setReceiptModal({ orderId, paidWith: paid, change: veltas });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error al procesar pago: ${err.error || 'Intenta de nuevo.'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openSplitModal = (orderId: number, total: number) => {
    setSplitCash("");
    setSplitTransfer(total.toString());
    setSplitModal({ orderId, total });
  };

  const openCashModal = (orderId: number, total: number) => {
    setCashPaidWith("");
    setCashModal({ orderId, total });
  };

  const handleSplitPayment = async () => {
    if (!splitModal) return;
    const cash = parseFloat(splitCash) || 0;
    const transfer = parseFloat(splitTransfer) || 0;
    if (cash + transfer < splitModal.total) {
      alert(`El total dividido ($${(cash + transfer).toLocaleString()}) es menor al total de la orden ($${splitModal.total.toLocaleString()}).`);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${splitModal.orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAID",
          paymentMethod: "MIXED",
          splitPayments: [
            ...(cash > 0 ? [{ method: "CASH", amount: cash }] : []),
            ...(transfer > 0 ? [{ method: "TRANSFER", amount: transfer }] : []),
          ]
        })
      });
      if (res.ok) {
        setPendingOrders(prev => prev.filter(o => o.id !== splitModal.orderId));
        setSplitModal(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Error: ${err.error || 'No se pudo procesar el pago dividido.'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAutomatedSplitPayment = async (orderId: number, cash: number, trans: number) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAID",
          paymentMethod: "MIXED",
          splitPayments: [
            ...(cash > 0 ? [{ method: "CASH", amount: cash }] : []),
            ...(trans > 0 ? [{ method: "TRANSFER", amount: trans }] : []),
          ]
        })
      });
      if (res.ok) {
        setPendingOrders(prev => prev.filter(o => o.id !== orderId));
        setReceiptModal({ orderId });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "Todos" || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const role = session?.user?.role as string;
  const isCashierOrAdmin = role === 'ADMIN' || role === 'CASHIER';

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center bg-zinc-50"><Loader2 className="animate-spin text-orange-500" size={48} /></div>;
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden font-sans relative">
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 md:h-24 lg:h-32 flex flex-col justify-center px-4 md:px-10 bg-white border-b border-zinc-200 shrink-0 relative z-20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="lg:hidden">
                <button
                  onClick={() => setShowMobileSummary(!showMobileSummary)}
                  className="p-3 bg-zinc-950 text-white rounded-2xl relative shadow-lg shadow-black/20"
                >
                  <ShoppingCart size={20} strokeWidth={2.5} />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 bg-orange-600 text-white text-[10px] flex items-center justify-center rounded-full font-black border-2 border-white">
                      {cart.reduce((s, i) => s + i.quantity, 0)}
                    </span>
                  )}
                </button>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  {viewStep === 'PRODUCTS' && (
                    <button 
                      onClick={() => setViewStep('TABLE')}
                      className="p-2 -ml-2 hover:bg-zinc-100 rounded-xl transition-colors text-zinc-400 hover:text-orange-600"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  <h1 className="text-xl md:text-3xl font-black text-zinc-950 tracking-tight leading-none">
                    {viewMode === 'NEW' ? (viewStep === 'TABLE' ? 'Seleccionar Mesa' : `Mesa ${selectedTable?.number}`) : 'Cuentas'}
                  </h1>
                </div>
                <p className="hidden sm:block text-zinc-400 font-bold mt-1 uppercase tracking-widest text-[8px] lg:text-[10px]">Operador: {role || 'Personal'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isCashierOrAdmin && (
                <div className="flex bg-zinc-100 p-1 rounded-2xl gap-1">
                  <button
                    onClick={() => setViewMode('NEW')}
                    className={`px-4 lg:px-6 py-2 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] ${viewMode === 'NEW' ? 'bg-white shadow-sm text-orange-600' : 'text-zinc-400'}`}
                  >
                    <PlusCircle size={14} /> <span className="hidden sm:inline">Nueva</span>
                  </button>
                  <button
                    onClick={() => setViewMode('PENDING')}
                    className={`px-4 lg:px-6 py-2 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] ${viewMode === 'PENDING' ? 'bg-white shadow-sm text-emerald-600' : 'text-zinc-400'}`}
                  >
                    <ListOrdered size={14} /> <span className="hidden sm:inline">Cuentas</span>
                    {pendingOrders.length > 0 && (
                      <span className="bg-zinc-950 text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                        {pendingOrders.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {viewMode === 'NEW' && viewStep === 'PRODUCTS' && (
            <div className="relative w-full animate-in fade-in slide-in-from-top-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="text"
                placeholder="Buscar arroz, bebidas, adiciones..."
                className="w-full h-10 lg:h-12 pl-12 pr-4 bg-zinc-50 border border-zinc-100 rounded-xl lg:rounded-2xl text-xs lg:text-base font-bold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/50 transition-all text-zinc-800 placeholder:text-zinc-300"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
        </header>

        {/* Dynamic Content Area */}
        {viewMode === 'NEW' ? (
          viewStep === 'TABLE' ? (
            <section className="flex-1 overflow-y-auto bg-zinc-50 animate-in fade-in">
              <TableMap 
                selectedTableId={selectedTable?.id}
                pendingOrders={pendingOrders}
                onSelect={(table) => {
                  const hasOrder = table.orders && table.orders.length > 0;
                  if (hasOrder) {
                    startEditingOrder(table.orders![0].id, table);
                  } else {
                    setSelectedTable(table);
                    setDeliveryData(null);
                    setTakeawayData(null);
                    setViewStep('PRODUCTS');
                  }
                }}
                onSelectOrder={(order) => {
                  startEditingOrder(order.id, { 
                    id: null, 
                    number: `${order.source === 'DELIVERY' ? 'Domi' : 'Barra'} - ${order.customerName || 'S/N'}`,
                    status: 'OCCUPIED'
                  });
                }}
                onSelectDelivery={() => {
                  setShowDeliveryModal(true);
                  setSelectedTable(null);
                  setTakeawayData(null);
                }}
                onSelectTakeaway={() => {
                  setShowTakeawayModal(true);
                  setSelectedTable(null);
                  setDeliveryData(null);
                }}
              />
              {showDeliveryModal && (
                <DeliveryModal 
                  onCancel={() => setShowDeliveryModal(false)}
                  onConfirm={(data) => {
                    setDeliveryData(data);
                    setSelectedTable(null);
                    setTakeawayData(null);
                    setShowDeliveryModal(false);
                    setViewStep('PRODUCTS');
                  }}
                />
              )}
              {showTakeawayModal && (
                <TakeawayModal
                  onCancel={() => setShowTakeawayModal(false)}
                  onConfirm={(data) => {
                    setTakeawayData(data);
                    setSelectedTable(null);
                    setDeliveryData(null);
                    setShowTakeawayModal(false);
                    setViewStep('PRODUCTS');
                  }}
                />
              )}
            </section>
          ) : (
            <section className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-8 bg-zinc-50/50 animate-in fade-in">
              <div className="flex gap-2 lg:gap-3 overflow-x-auto pb-2 no-scrollbar">
                {['Todos', ...Array.from(new Set(products.map(p => p.category)))].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 lg:px-6 py-2 lg:py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === cat
                        ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/20"
                        : "bg-white text-zinc-400 border border-zinc-200"
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="animate-spin text-orange-500" size={48} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-6 pb-24 md:pb-0">
                  {filteredProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAdd={addToCart}
                    />
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center h-48 text-zinc-400">
                      <Search size={48} className="opacity-20 mb-4" />
                      <p className="font-bold uppercase tracking-widest text-xs">Sin resultados para "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        ) : viewMode === 'SUMMARY' ? (
          <section className="flex-1 overflow-y-auto p-4 lg:p-8 bg-zinc-50 animate-in fade-in">
             <h2 className="text-xl lg:text-2xl font-black mb-8 text-zinc-800 tracking-tight flex items-center gap-3">
              <DollarSign className="text-emerald-500" />
              Resumen del Turno
              <span className="ml-3 text-sm font-bold text-zinc-400">Hoy</span>
            </h2>

            {/* Shift Sales Dashboard */}
            {salesSummary.length > 0 ? (
              <div className="bg-white border-2 border-zinc-100 rounded-[40px] p-8 lg:p-12 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-2">Recaudación Total (Día Actual)</h3>
                    <p className="text-4xl md:text-6xl font-black text-emerald-600 tracking-tighter">
                      ${salesSummary.reduce((acc: any, s: any) => acc + s.total, 0).toLocaleString()}
                    </p>
                  </div>
                  <button 
                    onClick={refreshOrders}
                    className="px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-zinc-200 flex items-center gap-2"
                  >
                    Actualizar Datos
                  </button>
                </div>
                
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-6 px-2">Desglose por Mesero</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {salesSummary.map((userSum: any) => (
                    <div key={userSum.id} className="flex items-center gap-4 bg-zinc-50 p-5 rounded-[32px] border border-zinc-100 shadow-sm transition-all hover:scale-[1.02]">
                      <div className="w-14 h-14 bg-white shadow-sm text-zinc-600 rounded-2xl flex items-center justify-center font-black text-lg shrink-0">
                        {userSum.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 truncate leading-none mb-1.5">{userSum.name}</p>
                        <p className="text-xl font-black text-zinc-900 leading-none">${userSum.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-400 bg-white rounded-[40px] border-2 border-dashed border-zinc-200">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p className="font-bold uppercase tracking-widest text-xs">Calculando totales del día...</p>
              </div>
            )}
          </section>
        ) : (
          <section className="flex-1 overflow-y-auto p-4 lg:p-8 bg-zinc-50">
            <h2 className="text-xl lg:text-2xl font-black mb-4 text-zinc-800 tracking-tight">
              Cuentas Abiertas
              <span className="ml-3 text-sm font-bold text-zinc-400">({pendingOrders.length} activas)</span>
            </h2>

            {pendingOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                <ListOrdered size={64} className="opacity-20 mb-4" />
                <p className="font-bold uppercase tracking-widest text-xs">No hay cuentas abiertas</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
                {pendingOrders.map(order => (
                  <div key={order.id} className="bg-white border border-zinc-200 rounded-3xl p-5 lg:p-6 shadow-sm flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <span className="font-black text-[10px] text-zinc-400 tracking-widest uppercase">Orden #{order.id}</span>
                        {order.customerName && (
                          <p className="text-xs font-bold text-zinc-700 mt-0.5">{order.customerName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.open(`/pos/print/kitchen/${order.id}`, '_blank')}
                          title="Imprimir Comanda Cocina"
                          className="p-2 bg-zinc-100 text-zinc-500 hover:bg-orange-100 hover:text-orange-600 rounded-xl transition-all"
                        >
                          <ChefHat size={16} />
                        </button>
                        <button
                          onClick={() => window.open(`/pos/print/receipt/${order.id}`, '_blank')}
                          title="Imprimir Pre-cuenta"
                          className="p-2 bg-zinc-100 text-zinc-500 hover:bg-emerald-100 hover:text-emerald-600 rounded-xl transition-all"
                        >
                          <Printer size={16} />
                        </button>
                        <span className="px-2 py-1 bg-amber-100 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                          {order.source === 'DELIVERY' ? 'DOMICILIO' : order.source === 'TAKEAWAY' ? 'PARA LLEVAR' : order.source || 'POS'}
                        </span>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          title="Eliminar Orden"
                          className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-xl transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <ul className="mb-6 space-y-2 flex-1">
                      {order.items.map((i: any) => (
                        <li key={i.id} className="text-xs font-bold text-zinc-700 leading-snug flex justify-between">
                          <span className="line-clamp-1">{i.quantity}x {i.product.name} <span className="text-zinc-400">({i.sizeName})</span></span>
                          <span className="shrink-0 ml-2">${Number(i.price).toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="border-t border-zinc-100 pt-4 mt-auto">
                      <p className="text-xl lg:text-2xl font-black text-orange-600 mb-4">${Number(order.total).toLocaleString()}</p>

                      <div className="grid grid-cols-2 gap-2 text-white font-black text-[10px] uppercase tracking-widest">
                        <button onClick={() => openCashModal(order.id, Number(order.total))} className="bg-emerald-500 hover:bg-emerald-600 p-3 rounded-xl transition-all active:scale-95">Efectivo</button>
                        <button onClick={() => markAsPaid(order.id, 'TRANSFER')} className="bg-purple-500 hover:bg-purple-600 p-3 rounded-xl transition-all active:scale-95">Transfe</button>
                        <button onClick={() => openSplitModal(order.id, Number(order.total))} className="col-span-2 bg-zinc-800 hover:bg-zinc-700 p-3 rounded-xl text-zinc-200 transition-all active:scale-95">Dividir Pago</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Right Order Panel - Responsive Drawer */}
      {viewMode === 'NEW' && (
        <>
          {/* Backdrop for mobile */}
          {showMobileSummary && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setShowMobileSummary(false)}
            />
          )}

          <aside className={`
            fixed lg:static inset-y-0 right-0 z-50 lg:z-10
            w-[90%] sm:w-[420px] lg:w-[420px] 
            bg-zinc-900 shadow-2xl lg:shadow-none
            transform transition-transform duration-300 ease-in-out
            ${showMobileSummary ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
            border-l border-zinc-800 overflow-hidden flex flex-col
          `}>
            {/* Mobile Header for drawer */}
            <div className="lg:hidden p-6 border-b border-zinc-800 flex justify-between items-center text-white shrink-0">
              <h3 className="font-black uppercase tracking-widest text-sm">Resumen de Comanda</h3>
              <button onClick={() => setShowMobileSummary(false)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <OrderSummary
                items={cart}
                role={role}
                isPanicActive={isPanicActive}
                selectedTable={selectedTable}
                onRemoveItem={removeFromCart}
                onUpdateNotes={updateCartItemNotes}
                onClearCart={clearCart}
                onPlaceOrder={placeOrder}
                isDelivery={!!deliveryData}
                isTakeaway={!!takeawayData}
                customerName={takeawayData?.name || deliveryData?.name || ""}
                isEditing={!!editOrderId}
              />
            </div>
          </aside>
        </>
      )}

      {/* Floating Bottom Bar for Mobile Cart Status */}
      {viewMode === 'NEW' && cart.length > 0 && !showMobileSummary && (
        <div className="lg:hidden fixed bottom-24 left-6 right-6 z-40 animate-in slide-in-from-bottom-10">
          <button
            onClick={() => setShowMobileSummary(true)}
            className="w-full bg-orange-600 text-white p-6 rounded-[32px] shadow-2xl shadow-orange-600/40 flex items-center justify-between font-black uppercase tracking-widest text-xs"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-xl">
                <ShoppingCart size={20} />
              </div>
              <span>{cart.reduce((s, i) => s + i.quantity, 0)} Items</span>
            </div>
            <span>${cart.reduce((s, i) => s + (i.size.price * i.quantity), 0).toLocaleString()} • Ver Pedido</span>
          </button>
        </div>
      )}

      {/* Split Payment Modal */}
      {splitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-zinc-900">Pago Dividido</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">
                  Total a pagar: <span className="text-orange-600">${splitModal.total.toLocaleString()}</span>
                </p>
              </div>
              <button onClick={() => setSplitModal(null)} className="p-3 bg-zinc-100 rounded-2xl text-zinc-500 hover:bg-zinc-200 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
                  <Banknote size={14} className="text-emerald-500" /> Monto en Efectivo
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={splitCash}
                  onChange={(e) => {
                    setSplitCash(e.target.value);
                    const remaining = splitModal.total - (parseFloat(e.target.value) || 0);
                    setSplitTransfer(Math.max(0, remaining).toString());
                  }}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-6 py-4 text-2xl font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
                  <Smartphone size={14} className="text-purple-500" /> Monto por Transferencia
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={splitTransfer}
                  onChange={(e) => {
                    setSplitTransfer(e.target.value);
                    const remaining = splitModal.total - (parseFloat(e.target.value) || 0);
                    setSplitCash(Math.max(0, remaining).toString());
                  }}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-6 py-4 text-2xl font-black text-purple-600 focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div className="bg-zinc-50 rounded-2xl p-4 flex justify-between text-sm font-bold text-zinc-500">
                <span>Total Ingresado</span>
                <span className={`font-black ${(parseFloat(splitCash) || 0) + (parseFloat(splitTransfer) || 0) >= splitModal.total ? "text-emerald-600" : "text-red-500"}`}>
                  ${((parseFloat(splitCash) || 0) + (parseFloat(splitTransfer) || 0)).toLocaleString()}
                </span>
              </div>

              <button
                onClick={handleSplitPayment}
                disabled={(parseFloat(splitCash) || 0) + (parseFloat(splitTransfer) || 0) < splitModal.total}
                className="w-full bg-zinc-900 hover:bg-orange-600 text-white font-black py-5 rounded-3xl uppercase tracking-widest text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirmar Pago Dividido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Prompt Modal */}
      {receiptModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-10 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 bg-emerald-500 text-white rounded-[28px] flex items-center justify-center shadow-xl shadow-emerald-500/30">
                <CheckCircle2 size={40} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 tracking-tight">¡Pago Registrado!</h3>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Orden #{receiptModal.orderId}</p>
              </div>
              <p className="text-zinc-500 text-sm font-bold">¿Deseas imprimir el recibo para el cliente?</p>
            </div>
            <div className="p-6 pt-0 flex flex-col gap-3">
              <button
                onClick={() => {
                  const url = `/pos/print/receipt/${receiptModal.orderId}` + 
                    (receiptModal.paidWith ? `?paidWith=${receiptModal.paidWith}&change=${receiptModal.change}` : "");
                  window.open(url, '_blank');
                  setReceiptModal(null);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-3xl flex items-center justify-center gap-3 uppercase tracking-widest text-xs shadow-xl shadow-emerald-600/20 transition-all active:scale-95"
              >
                <Printer size={18} /> Imprimir Recibo
              </button>
              <button
                onClick={() => setReceiptModal(null)}
                className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 font-black py-4 rounded-3xl uppercase tracking-widest text-xs transition-all"
              >
                Omitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Payment Modal with Calculator */}
      {cashModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-emerald-50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500 text-white rounded-2xl">
                  <Banknote size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-zinc-900">Pago en Efectivo</h3>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-1">Total: ${cashModal.total.toLocaleString()}</p>
                </div>
              </div>
              <button onClick={() => setCashModal(null)} className="p-3 bg-white/50 rounded-2xl text-zinc-400 hover:text-zinc-600 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="space-y-4 text-center">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">¿Con cuánto pagan?</label>
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-zinc-300">$</span>
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    value={cashPaidWith}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setCashPaidWith(val);
                    }}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-[30px] px-16 py-6 text-4xl font-black text-zinc-900 focus:border-emerald-500 focus:ring-0 outline-none transition-all text-center"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="bg-zinc-900 rounded-[32px] p-8 text-center space-y-2 shadow-xl shadow-zinc-900/10">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Cambio / Vueltas</p>
                <p className={`text-5xl font-black ${(parseFloat(cashPaidWith) || 0) >= cashModal.total ? "text-emerald-400" : "text-zinc-600"}`}>
                  ${Math.max(0, (parseFloat(cashPaidWith) || 0) - cashModal.total).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => {
                  markAsPaid(cashModal.orderId, 'CASH');
                  setCashModal(null);
                }}
                disabled={(parseFloat(cashPaidWith) || 0) < cashModal.total}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-6 rounded-[30px] uppercase tracking-widest text-sm transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20"
              >
                Confirmar Pago y Cerrar
                <CheckCircle2 size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

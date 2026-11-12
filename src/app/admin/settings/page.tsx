"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { 
  Users,
  Receipt,
  UserPlus,
  AlertTriangle,
  Settings as SettingsIcon,
  Loader2,
  Trash2,
  Flame,
  Smartphone,
  Wifi,
  WifiOff,
  Send,
  QrCode,
  RefreshCw,
  Clock
} from "lucide-react";
import { useRouter } from "next/navigation";

interface ExpenseRecord {
  id: number;
  amount: number;
  description: string;
  category: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [isPanicActive, setIsPanicActive] = useState(false);
  const [isPickupOnlyActive, setIsPickupOnlyActive] = useState(false);
  const [isExtendedTimeActive, setIsExtendedTimeActive] = useState(false);
  const [isAutoTriggered, setIsAutoTriggered] = useState(false);
  const [isManuallySetToday, setIsManuallySetToday] = useState(false);

  // New User Form State
  const [newUser, setNewUser] = useState({ userName: "", name: "", role: "WAITER", password: "" });
  // User List State
  const [users, setUsers] = useState<any[]>([]);
  // Expense Form State
  const [newExpense, setNewExpense] = useState({ amount: "", description: "", category: "Operativo" });
  // Expense History
  const [expenseHistory, setExpenseHistory] = useState<ExpenseRecord[]>([]);
  // WhatsApp State
  const [waStatus, setWaStatus] = useState<string>("LOADING");
  const [waInstanceName, setWaInstanceName] = useState("");
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waInitializing, setWaInitializing] = useState(false);
  const [waTestNumber, setWaTestNumber] = useState("");
  const [waTestMessage, setWaTestMessage] = useState("Prueba desde el Panel Admin 🍚");
  const [waTestSending, setWaTestSending] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && session.user.role !== "ADMIN") {
      router.push("/pos");
    }
    
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/panic");
        const json = await res.json();
        setIsPanicActive(json.isPanicModeActive);
        setIsPickupOnlyActive(json.isPickupOnlyActive);
        setIsExtendedTimeActive(json.isExtendedTimeActive || false);
        setIsAutoTriggered(json.isAutoTriggered || false);
        setIsManuallySetToday(json.isManuallySetToday || false);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchExpenses = async () => {
      try {
        const res = await fetch("/api/expenses?days=30");
        const data = await res.json();
        if (Array.isArray(data)) setExpenseHistory(data);
      } catch (err) {
        console.error(err);
      }
    };

    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        const data = await res.json();
        if (Array.isArray(data)) setUsers(data);
      } catch (err) {
        console.error(err);
      }
    };

    if (status === "authenticated" && session.user.role === "ADMIN") {
      fetchSettings();
      fetchExpenses();
      fetchWaStatus();
      fetchUsers();
    }
  }, [status, session, router]);

  const fetchWaStatus = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp");
      const data = await res.json();
      setWaStatus(data.status || "NOT_CONFIGURED");
      setWaInstanceName(data.instanceName || "");
    } catch { setWaStatus("ERROR"); }
  };

  const handleWaInit = async () => {
    setWaInitializing(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appUrl: window.location.origin })
      });
      const data = await res.json();
      if (data.success) {
        await fetchWaStatus();
        await fetchWaQr();
      } else {
        alert(`Error: ${data.error || "No se pudo inicializar"}`);
      }
    } catch (err) { console.error(err); }
    finally { setWaInitializing(false); }
  };

  const fetchWaQr = async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/qr");
      const data = await res.json();
      
      if (data.qr) {
        setWaQr(data.qr);
        console.log("QR code received successfully");
      } else if (data.connected) {
        setWaStatus("CONNECTED");
        setWaQr(null);
        alert("La instancia ya está conectada.");
      } else if (data.error) {
        alert(`Error al obtener QR: ${data.error}`);
        setWaQr(null);
      } else {
        console.log("No QR found in response:", data);
        setWaQr(null);
      }
    } catch (err) { 
      console.error("Fetch QR error:", err);
      setWaQr(null); 
      alert("Error de conexión al obtener el código QR.");
    }
  };

  const handleWaTestSend = async () => {
    if (!waTestNumber || !waTestMessage) return;
    setWaTestSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: waTestNumber, message: waTestMessage })
      });
      const data = await res.json();
      if (data.success) alert("✅ Mensaje enviado correctamente.");
      else alert(`Error: ${data.error}`);
    } catch { alert("Error de conexión."); }
    finally { setWaTestSending(false); }
  };

  const togglePanic = async () => {
    try {
      const res = await fetch("/api/admin/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !isPanicActive })
      });
      const json = await res.json();
      setIsPanicActive(json.isPanicModeActive);
    } catch (err) {
      console.error(err);
    }
  };

  const togglePickupOnly = async () => {
    try {
      const res = await fetch("/api/admin/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupOnly: !isPickupOnlyActive })
      });
      const json = await res.json();
      setIsPickupOnlyActive(json.isPickupOnlyActive);
      setIsAutoTriggered(json.isAutoTriggered || false);
      setIsManuallySetToday(json.isManuallySetToday || false);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleExtendedTime = async () => {
    try {
      const res = await fetch("/api/admin/panic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extendedTime: !isExtendedTimeActive })
      });
      const json = await res.json();
      setIsExtendedTimeActive(json.isExtendedTimeActive);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        alert("¡Usuario creado con éxito!");
        setNewUser({ userName: "", name: "", role: "WAITER", password: "" });
        
        // Refresh users list
        const fetchRes = await fetch("/api/users");
        const data = await fetchRes.json();
        if (Array.isArray(data)) setUsers(data);
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este usuario?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers(users.filter(u => u.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "No se pudo eliminar el usuario");
      }
    } catch(err) { console.error(err); }
  };

  const handleUpdatePassword = async (id: number) => {
    const newPassword = prompt("Ingresa la nueva contraseña para este usuario:");
    if (!newPassword) return;
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        alert("Contraseña actualizada exitosamente");
      } else {
        alert("Error al actualizar la contraseña");
      }
    } catch(err) { console.error(err); }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newExpense)
      });
      if (res.ok) {
        const created = await res.json();
        setExpenseHistory(prev => [{ ...created, amount: Number(created.amount), createdAt: created.createdAt }, ...prev]);
        setNewExpense({ amount: "", description: "", category: "Operativo" });
      }
    } catch (err) { console.error(err); }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="animate-spin text-orange-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans selection:bg-orange-600/10 p-8 md:p-12">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shrink-0 border-b border-zinc-100 pb-10">
          <div>
            <span className="text-orange-500 font-black uppercase tracking-widest text-xs">Panel de Control</span>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tight mt-1">Ajustes del Sistema</h1>
          </div>
          
          <div className="bg-zinc-100 p-1 rounded-2xl flex gap-1 border border-zinc-200">
            <button 
              onClick={() => setActiveTab("users")}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "users" ? "bg-white text-zinc-900 shadow-md border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              <Users size={14} /> Usuarios
            </button>
            <button 
              onClick={() => setActiveTab("expenses")}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "expenses" ? "bg-white text-zinc-900 shadow-md border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              <Receipt size={14} /> Gastos
            </button>
            <button 
              onClick={() => setActiveTab("panic")}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "panic" ? "bg-white text-zinc-900 shadow-md border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              <AlertTriangle size={14} /> Emergencia
            </button>
            <button 
              onClick={() => setActiveTab("whatsapp")}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "whatsapp" ? "bg-white text-zinc-900 shadow-md border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              <Smartphone size={14} /> WhatsApp
            </button>
          </div>
        </header>

        {/* Tabs Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === "users" && (
            <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
              <div className="flex items-center gap-6 mb-10">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center border border-emerald-100">
                  <UserPlus size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">Gestión de Personal</h3>
                  <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Registra nuevos empleados y asigna sus roles</p>
                </div>
              </div>
              
              <form onSubmit={handleCreateUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">ID de Usuario (Login)</label>
                    <input 
                      type="text" 
                      value={newUser.userName}
                      required
                      onChange={e => setNewUser({...newUser, userName: e.target.value})}
                      placeholder="ej: pedro_cocina"
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-orange-600 focus:ring-1 focus:ring-orange-600 outline-none font-bold placeholder:text-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Nombre Completo</label>
                    <input 
                      type="text" 
                      value={newUser.name}
                      required
                      onChange={e => setNewUser({...newUser, name: e.target.value})}
                      placeholder="Pedro Pérez"
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-orange-600 focus:ring-1 focus:ring-orange-600 outline-none font-bold placeholder:text-zinc-300"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Contraseña Temporal</label>
                    <input 
                      type="password" 
                      value={newUser.password}
                      required
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-orange-600 focus:ring-1 focus:ring-orange-600 outline-none font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Rol Operativo</label>
                    <select 
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-orange-600 outline-none font-black uppercase tracking-widest text-xs appearance-none"
                    >
                      <option value="WAITER">Mesero</option>
                      <option value="CASHIER">Caja / Facturación</option>
                      <option value="CHEF">Cocinero</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full bg-zinc-900 text-white font-black py-6 rounded-3xl uppercase tracking-[0.2em] text-xs hover:bg-orange-600 transition-all shadow-xl hover:shadow-orange-600/30 mt-4">
                  Crear Cuenta de Usuario
                </button>
              </form>

              {/* Users List */}
              <div className="mt-12 pt-12 border-t border-zinc-100">
                <h4 className="text-xl font-black mb-6">Usuarios Registrados</h4>
                <div className="space-y-3">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-5 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-all flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white text-zinc-900 rounded-xl flex items-center justify-center font-black text-sm border border-zinc-200 shadow-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-sm text-zinc-900">{u.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{u.role}</span>
                            <span className="text-[9px] text-zinc-300">•</span>
                            <span className="text-[9px] text-zinc-400">Login: {u.userName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleUpdatePassword(u.id)}
                          className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                        >
                          Cambiar Clave
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && <p className="text-xs text-zinc-400 font-bold">No hay usuarios (cargando...)</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === "expenses" && (
            <div className="space-y-8">
              <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
                <div className="flex items-center gap-6 mb-10">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center border border-red-100">
                    <Receipt size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Registrar Gasto</h3>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Registra egresos para el balance diario</p>
                  </div>
                </div>

                <form onSubmit={handleCreateExpense} className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Monto del Gasto ($)</label>
                    <input 
                      type="number" 
                      value={newExpense.amount}
                      required
                      onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-zinc-50 border border-zinc-200 p-6 rounded-3xl focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none font-black text-4xl text-red-600 placeholder:text-red-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Descripción Detallada</label>
                    <input 
                      type="text" 
                      value={newExpense.description}
                      required
                      onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                      placeholder="Ej: Pago de Luz local, Compra de verduras..."
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none font-bold placeholder:text-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">Categoría Contable</label>
                    <select 
                      value={newExpense.category}
                      onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none font-black uppercase tracking-widest text-xs appearance-none"
                    >
                      <option value="Operativo">Gasto Operativo</option>
                      <option value="Servicios">Servicios Públicos</option>
                      <option value="Insumos Extra">Insumos de Almacén</option>
                      <option value="Personal">Pagos a Staff</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-red-600 text-white font-black py-6 rounded-3xl uppercase tracking-[0.2em] text-xs hover:bg-red-700 transition-all shadow-xl hover:shadow-red-600/30 mt-4">
                    Registrar Salida de Dinero
                  </button>
                </form>
              </div>

              {/* Expense History */}
              <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tight">Historial de Gastos</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Últimos 30 días</span>
                </div>
                {expenseHistory.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-zinc-400 border-2 border-dashed border-zinc-100 rounded-3xl">
                    <Receipt size={48} className="opacity-20 mb-4" />
                    <p className="font-bold uppercase tracking-widest text-xs">Sin gastos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenseHistory.map(exp => (
                      <div key={exp.id} className="flex items-center justify-between p-5 rounded-2xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center font-black text-sm border border-red-100">
                            $
                          </div>
                          <div>
                            <p className="font-black text-sm text-zinc-900">{exp.description}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{exp.category}</span>
                              <span className="text-[9px] text-zinc-300">•</span>
                              <span className="text-[9px] font-bold text-zinc-400">
                                {new Date(exp.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xl font-black text-red-600">-${exp.amount.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "panic" && (
            <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
              <div className="flex items-center gap-6 mb-10">
                <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border transition-all ${isPanicActive ? "bg-red-600 text-white border-red-500 animate-pulse" : "bg-orange-50 text-orange-600 border-orange-100"}`}>
                  <AlertTriangle size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">Protocolo de Emergencia</h3>
                  <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Activa el Modo Pánico si la cocina está saturada</p>
                </div>
              </div>

              <div className="p-8 bg-zinc-50 rounded-3xl border border-zinc-200 space-y-6">
                <div className="flex justify-between items-center">
                   <div>
                      <p className="font-black text-zinc-900 uppercase tracking-widest text-sm">Estado del Modo Pánico</p>
                      <p className="text-xs text-zinc-500 font-medium max-w-sm mt-1">Al activarse, se bloqueará la creación de nuevos pedidos en el POS hasta que se apague.</p>
                   </div>
                   <div 
                    onClick={togglePanic}
                    className={`w-20 h-10 rounded-full cursor-pointer transition-all relative ${isPanicActive ? "bg-red-600 shadow-lg shadow-red-600/30" : "bg-zinc-300"}`}
                   >
                     <div className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-all ${isPanicActive ? "left-11 shadow-md" : "left-1"}`} />
                   </div>
                </div>

                {isPanicActive && (
                  <div className="bg-red-50 border border-red-100 p-6 rounded-2xl flex gap-4 items-center">
                    <div className="w-10 h-10 bg-red-600 text-white rounded-xl flex items-center justify-center animate-pulse">
                      <Flame size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-red-600 uppercase tracking-widest leading-none">Alerta Activa</p>
                      <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">Todos los meseros están viendo la señal de bloqueo.</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-8 pt-8 border-t border-zinc-200">
                   <div>
                      <p className="font-black text-zinc-900 uppercase tracking-widest text-sm">Cierre de Domicilios ("No más domicilios")</p>
                      <p className="text-xs text-zinc-500 font-medium max-w-md mt-1">
                        Desactiva inmediatamente la recepción de domicilios por WhatsApp y POS. Se activa automáticamente faltando 30 min para cerrar (6:00 PM) y se restablece solo al iniciar el siguiente día de servicio.
                      </p>
                   </div>
                   <div 
                    onClick={togglePickupOnly}
                    className={`w-20 h-10 rounded-full cursor-pointer transition-all relative ${isPickupOnlyActive ? "bg-orange-600 shadow-lg shadow-orange-600/30" : "bg-zinc-300"}`}
                   >
                     <div className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-all ${isPickupOnlyActive ? "left-11 shadow-md" : "left-1"}`} />
                   </div>
                </div>

                {isPickupOnlyActive && (
                  <div className="bg-orange-50 border border-orange-100 p-6 rounded-2xl flex gap-4 items-center">
                    <div className="w-10 h-10 bg-orange-600 text-white rounded-xl flex items-center justify-center animate-pulse">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-orange-600 uppercase tracking-widest leading-none">
                        Domicilios Suspendidos (Solo Recoger)
                      </p>
                      <p className="text-[10px] text-orange-600 font-bold mt-1 uppercase">
                        {isAutoTriggered 
                          ? "Activado automáticamente por horario (quedan 30 min o menos para el cierre de cocina a las 6:30 PM)." 
                          : isManuallySetToday 
                          ? "Activado manualmente por la administración para el servicio de hoy." 
                          : "Los clientes de WhatsApp y POS solo podrán realizar pedidos para recoger en local o consumo en mesa."}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center mt-8 pt-8 border-t border-zinc-200">
                   <div>
                      <p className="font-black text-zinc-900 uppercase tracking-widest text-sm">Tiempo de Entrega Extendido</p>
                      <p className="text-xs text-zinc-500 font-medium max-w-sm mt-1">
                        Al activarse, el bot informará un tiempo estimado de 1 hora a 1 hora y media. Desactivado (normal): 30 a 45 minutos.
                      </p>
                   </div>
                   <div 
                    onClick={toggleExtendedTime}
                    className={`w-20 h-10 rounded-full cursor-pointer transition-all relative ${isExtendedTimeActive ? "bg-amber-600 shadow-lg shadow-amber-600/30" : "bg-zinc-300"}`}
                   >
                     <div className={`absolute top-1 w-8 h-8 bg-white rounded-full transition-all ${isExtendedTimeActive ? "left-11 shadow-md" : "left-1"}`} />
                   </div>
                </div>

                {isExtendedTimeActive && (
                  <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4 items-center">
                    <div className="w-10 h-10 bg-amber-600 text-white rounded-xl flex items-center justify-center animate-pulse">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-600 uppercase tracking-widest leading-none">Tiempo Extendido Activo</p>
                      <p className="text-[10px] text-amber-500 font-bold mt-1 uppercase">El bot responderá que los pedidos demoran de 1 hora a 1 hora y media.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "whatsapp" && (
            <div className="space-y-8">
              {/* Connection Status */}
              <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
                <div className="flex items-center gap-6 mb-10">
                  <div className={`w-16 h-16 rounded-3xl flex items-center justify-center border transition-all ${
                    waStatus === "CONNECTED"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                      : waStatus === "NOT_CONFIGURED"
                      ? "bg-zinc-50 text-zinc-400 border-zinc-200"
                      : "bg-amber-50 text-amber-600 border-amber-100"
                  }`}>
                    {waStatus === "CONNECTED" ? <Wifi size={32} /> : <WifiOff size={32} />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Integración WhatsApp</h3>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">
                      Evolution API — {waInstanceName || "Sin instancia"}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                      waStatus === "CONNECTED"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                        : waStatus === "NOT_CONFIGURED"
                        ? "bg-zinc-100 text-zinc-400 border border-zinc-200"
                        : "bg-amber-50 text-amber-600 border border-amber-100"
                    }`}>
                      {waStatus === "CONNECTED" ? "Conectado" : waStatus === "NOT_CONFIGURED" ? "Sin Configurar" : "Desconectado"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={handleWaInit}
                    disabled={waInitializing || waStatus === "NOT_CONFIGURED"}
                    className="flex items-center justify-center gap-3 bg-zinc-900 text-white font-black py-5 rounded-3xl uppercase tracking-[0.15em] text-xs hover:bg-zinc-800 transition-all shadow-xl disabled:opacity-50"
                  >
                    {waInitializing ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
                    {waInitializing ? "Inicializando..." : "Inicializar Instancia"}
                  </button>
                  <button
                    onClick={fetchWaQr}
                    disabled={waStatus === "NOT_CONFIGURED"}
                    className="flex items-center justify-center gap-3 bg-emerald-600 text-white font-black py-5 rounded-3xl uppercase tracking-[0.15em] text-xs hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <RefreshCw size={18} />
                    Obtener QR
                  </button>
                </div>

                {waStatus === "NOT_CONFIGURED" && (
                  <div className="mt-6 bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                    <p className="text-sm font-bold text-amber-700">
                      ⚠️ Configura las variables en tu archivo <code className="bg-amber-100 px-2 py-0.5 rounded">.env</code>:
                    </p>
                    <pre className="mt-3 text-xs text-amber-800 font-mono bg-amber-100/50 p-4 rounded-xl">
{`EVOLUTION_API_URL=https://tu-evolution-api.com
EVOLUTION_API_KEY=tu-api-key
EVOLUTION_INSTANCE_NAME=arroceria`}
                    </pre>
                  </div>
                )}
              </div>

              {/* QR Code */}
              {waQr && (
                <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm text-center">
                  <h3 className="text-2xl font-black tracking-tight mb-2">Escanea el Código QR</h3>
                  <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest mb-8">
                    Abre WhatsApp → Dispositivos Vinculados → Vincular Dispositivo
                  </p>
                  <div className="inline-block p-6 bg-white border-2 border-zinc-200 rounded-3xl shadow-lg">
                    <img src={waQr} alt="QR WhatsApp" className="w-64 h-64" />
                  </div>
                </div>
              )}

              {/* Test Message */}
              <div className="bg-white border border-zinc-200 p-10 md:p-12 rounded-[48px] shadow-sm">
                <div className="flex items-center gap-6 mb-10">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center border border-blue-100">
                    <Send size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">Enviar Mensaje de Prueba</h3>
                    <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">
                      Verifica que la conexión funcione correctamente
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">
                      Número (formato 573XXXXXXXXX)
                    </label>
                    <input
                      type="text"
                      value={waTestNumber}
                      onChange={e => setWaTestNumber(e.target.value)}
                      placeholder="573001234567"
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none font-bold placeholder:text-zinc-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-4 mb-2 block">
                      Mensaje
                    </label>
                    <input
                      type="text"
                      value={waTestMessage}
                      onChange={e => setWaTestMessage(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 p-5 rounded-3xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none font-bold placeholder:text-zinc-300"
                    />
                  </div>
                  <button
                    onClick={handleWaTestSend}
                    disabled={waTestSending || !waTestNumber}
                    className="w-full bg-blue-600 text-white font-black py-6 rounded-3xl uppercase tracking-[0.2em] text-xs hover:bg-blue-700 transition-all shadow-xl hover:shadow-blue-600/30 disabled:opacity-50"
                  >
                    {waTestSending ? "Enviando..." : "Enviar Mensaje de Prueba"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

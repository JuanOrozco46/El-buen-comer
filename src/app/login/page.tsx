"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flame, Lock, User, ArrowRight, ShieldAlert, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Credenciales incorrectas. Verifica tu acceso.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden font-sans">
      {/* Left side: Visual Experience (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden group">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[20s] ease-out group-hover:scale-110"
          style={{ backgroundImage: "url('/login-bg.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
        
        <div className="absolute bottom-20 left-20 z-10 max-w-lg">
          <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center text-white mb-8 shadow-2xl shadow-orange-600/40">
            <Flame size={32} />
          </div>
          <h2 className="text-6xl font-black text-white tracking-tighter leading-[0.9]">
            Donde el <br />
            <span className="text-orange-500 italic">arroz</span> es <br />
            el protagonista.
          </h2>
          <p className="text-zinc-400 mt-6 font-bold tracking-wide uppercase text-xs border-l-2 border-orange-600 pl-4">
            Gestión Integral de Restaurantes de Alto Volumen
          </p>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center items-center p-8 lg:p-24 bg-zinc-950 relative">
        {/* Subtle background decoration for mobile/right side */}
        <div className="absolute top-1/4 right-0 w-64 h-64 bg-orange-600/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="w-full max-w-md z-10">
          <div className="lg:hidden flex flex-col items-center mb-12">
             <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center text-white mb-6">
                <Flame size={32} />
             </div>
             <h1 className="text-4xl font-black text-white tracking-tighter">Arrocería</h1>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h3 className="text-2xl font-black text-white tracking-tight">Bienvenido al Sistema</h3>
            <p className="text-zinc-500 font-bold text-xs mt-2 uppercase tracking-widest">Ingresa tus credenciales operativas</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                <ShieldAlert className="text-red-500 shrink-0" size={20} />
                <p className="text-red-400 text-xs font-bold tracking-tight">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-black tracking-widest text-zinc-500 uppercase ml-2">Identificador</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-orange-500 transition-colors">
                  <User size={18} />
                </div>
                <input 
                  type="text" 
                  placeholder="Usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 text-white rounded-2xl py-5 pl-14 pr-6 font-bold tracking-tight focus:outline-none focus:border-orange-500/50 focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black tracking-widest text-zinc-500 uppercase ml-2">Contraseña</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-orange-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 text-white rounded-2xl py-5 pl-14 pr-6 font-bold tracking-tight focus:outline-none focus:border-orange-500/50 focus:bg-zinc-900 transition-all placeholder:text-zinc-700"
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-5 rounded-2xl mt-6 flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-orange-600/20 group"
            >
              <span className="tracking-widest uppercase text-xs">
                {isLoading ? "Validando Acceso" : "Confirmar e Ingresar"}
              </span>
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-zinc-900 text-center lg:text-left">
            <p className="text-zinc-700 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">
              Propiedad Intelectual • El Buen Comer <br /> 
              V.2.4.0 • Acceso Protegido
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

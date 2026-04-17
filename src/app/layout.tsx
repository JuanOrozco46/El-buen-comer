import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import { Navigation } from "../components/layout/Navigation";
import { AuthProvider } from "../components/providers/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "El buen comer POS | Premium ERP",
  description: "Sistema de gestión integral para el restaurante El buen comer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-zinc-900 bg-zinc-50`}>
        <AuthProvider>
          <div className="flex min-h-screen">
            <Navigation />
            <div className="flex-1 relative overflow-hidden flex flex-col">
              {children}
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

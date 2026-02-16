// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import AppShell from "./components/AppShell";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "PadelX QA",
  description: "Gestión de torneos y jugadores de pádel en tiempo real",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-[#05070b] text-gray-900 antialiased">
        <AppShell>{children}</AppShell>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
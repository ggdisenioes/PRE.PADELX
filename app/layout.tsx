// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import AppShell from "./components/AppShell";
import WebVitalsReporter from "./components/WebVitalsReporter";
import { LanguageProvider } from "./i18n";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "TWINCO Pádel Manager",
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
        <LanguageProvider>
          <WebVitalsReporter />
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </LanguageProvider>
      </body>
    </html>
  );
}

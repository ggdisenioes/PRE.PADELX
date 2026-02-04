"use client";

import { Menu } from "lucide-react";

type HeaderProps = {
  onToggleSidebar?: () => void;
};

export default function Header({ onToggleSidebar }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-[#0b0f1a] border-b border-white/10 md:hidden">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Hamburger (mobile only) */}
          <button
            onClick={onToggleSidebar}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/10"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo / Title */}
          <span className="text-sm font-semibold text-white">
            Pádel Manager
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {/* Espacio para futuro: notificaciones / avatar */}
        </div>
      </div>
    </header>
  );
}
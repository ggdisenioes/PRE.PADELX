// ./components/Badge.tsx

import React from "react";

// Hacemos label opcional para que no rompa cuando usemos solo children
type BadgeProps = {
  label?: string;
  children?: React.ReactNode;
};

export default function Badge({ label, children }: BadgeProps) {
  return (
    <span className="inline-block px-3 py-1 text-xs font-bold rounded bg-gray-800 text-white">
      {children ?? label ?? "Sin estado"}
    </span>
  );
}
"use client";

import { useRole } from "../../../app/hooks/useRole";
import Link from "next/link";

export default function AdminUsersPage() {
  const { role, loading: roleLoading } = useRole();

  if (roleLoading) {
    return <div className="p-4 sm:p-6 text-gray-900">Cargando...</div>;
  }

  if (role !== "admin") {
    return (
      <div className="p-4 sm:p-6 text-red-600 font-semibold">
        No tenés permisos para acceder a esta sección.
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Administración de usuarios
        </h1>

        <Link
          href="/admin/users/manage"
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition"
        >
          + Crear usuario
        </Link>
      </div>

      {/* LISTADO DE USUARIOS */}
      <div className="bg-white rounded-lg shadow-sm border">
        {/* 
          Acá va la tabla/listado existente de usuarios.
          No tocar lógica existente de render si ya estaba implementada.
        */}
      </div>
    </div>
  );
}
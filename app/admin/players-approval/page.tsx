// ./app/admin/players-approval/page.tsx

"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase'; // Ajusta la ruta a tu lib/supabase
import Card from '../../components/Card';
import toast from 'react-hot-toast';

export default function PlayersApprovalPage() {
    const router = useRouter();
    const [pendingPlayers, setPendingPlayers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);

    // Check role on mount
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push("/login");
                return;
            }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
                router.push("/");
                return;
            }

            setHasAccess(true);
            fetchPendingPlayers();
        };

        checkAuth();
    }, [router]);

    const fetchPendingPlayers = async () => {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('is_approved', false)
            .order('created_at', { ascending: true });

        if (error) {
            toast.error('Error cargando solicitudes.');
        } else {
            setPendingPlayers(data || []);
        }
        setLoading(false);
    };

    const handleApprove = async (playerId: number, playerName: string) => {
        setLoading(true);
        const { error } = await supabase
            .from('players')
            .update({ is_approved: true })
            .eq('id', playerId);

        if (error) {
            toast.error(`Error al aprobar a ${playerName}.`);
        } else {
            toast.success(`${playerName} ha sido aprobado!`);
            // Refrescar la lista de pendientes (se puede hacer de forma reactiva con el Realtime, 
            // pero recargar es más simple por ahora)
            fetchPendingPlayers(); 
        }
    };

    const handleReject = async (playerId: number, playerName: string) => {
        if (!confirm(`¿Estás seguro de rechazar y eliminar a ${playerName}?`)) return;
        setLoading(true);
        
        // Rechazar implica eliminar el registro
        const { error } = await supabase
            .from('players')
            .delete()
            .eq('id', playerId);

        if (error) {
            toast.error(`Error al rechazar a ${playerName}.`);
        } else {
            toast.success(`${playerName} ha sido rechazado y eliminado.`);
            fetchPendingPlayers();
        }
    };
    
    if (loading) {
        return (
            <main className="flex-1 overflow-y-auto p-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-6">Aprobación de Jugadores</h2>
                <p>Cargando solicitudes...</p>
            </main>
        );
    }

    return (
        <main className="flex-1 overflow-y-auto p-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Aprobación de Jugadores ({pendingPlayers.length} pendientes)</h2>

            {pendingPlayers.length === 0 ? (
                <p className="text-gray-500">No hay solicitudes de jugadores pendientes en este momento.</p>
            ) : (
                <div className="space-y-4">
                    {pendingPlayers.map(player => (
                        <Card key={player.id} className="flex justify-between items-center p-4">
                            <div className="flex-1">
                                <p className="font-bold text-lg">{player.name}</p>
                                <p className="text-sm text-gray-500">{player.email}</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleApprove(player.id, player.name)}
                                    className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition"
                                    disabled={loading}
                                >
                                    Aprobar
                                </button>
                                <button
                                    onClick={() => handleReject(player.id, player.name)}
                                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                                    disabled={loading}
                                >
                                    Rechazar
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </main>
    );
}
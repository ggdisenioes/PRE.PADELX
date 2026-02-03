// ./app/components/AdminNotifications.tsx

"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { isAdminSession } from '../lib/admin';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

export function AdminNotifications() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const router = useRouter(); 

    // Función para obtener el conteo de pendientes (usada en la carga inicial y en el Realtime)
    const fetchPendingCount = useCallback(async () => {
        const { count } = await supabase
            .from('players')
            .select('*', { count: 'exact', head: true })
            .eq('is_approved', false);
        
        setPendingCount(count !== null ? count : 0);
        return count !== null ? count : 0;
    }, []);

    // 1. Verificar si el usuario actual es administrador y cargar el conteo inicial
    useEffect(() => {
        const checkAdminStatus = async () => {
            const { data: { session } } = await supabase.auth.getSession();

            if (isAdminSession(session)) {
                setIsAdmin(true);
                fetchPendingCount();
            }
        };
        checkAdminStatus();
    }, [fetchPendingCount]);

    // 2. Suscribirse a cambios en la tabla 'players' (Solo si es Admin)
    useEffect(() => {
        if (!isAdmin) return;
        
        const subscription = supabase
            .channel('admin_players_pending_notification') 
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'players' },
                (payload) => {
                    // Si el evento es una INSERCIÓN y el jugador no está aprobado, notificamos
                    if (payload.eventType === 'INSERT' && payload.new.is_approved === false) {
                        const newPlayer = payload.new;
                        setPendingCount(prev => prev + 1); // Incrementamos el badge inmediatamente

                        // Mostrar notificación push al administrador
                        toast.custom((t) => (
                            <div
                                className={`${t.visible ? 'animate-enter' : 'animate-leave'} 
                                bg-yellow-500 text-white p-4 rounded-lg shadow-lg max-w-sm cursor-pointer`}
                                onClick={() => {
                                    router.push('/players'); 
                                    toast.dismiss(t.id);
                                }}
                            >
                                <p className="font-bold">🚨 Solicitud de Jugador Pendiente</p>
                                <p className="text-sm">"{newPlayer.name}" se ha registrado.</p>
                                <p className="underline mt-1 text-xs">Haga clic para revisar</p>
                            </div>
                        ));
                    } 
                    
                    // Si el evento es una ACTUALIZACIÓN (aprobación) o DELETE (rechazo), 
                    // simplemente volvemos a obtener el conteo exacto para actualizar el badge.
                    // Esto asegura que el badge se vacíe correctamente.
                    if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
                        // Esperamos un momento para que la DB confirme el cambio
                         setTimeout(fetchPendingCount, 100); 
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [isAdmin, fetchPendingCount, router]);

    // Si no es Admin o no hay pendientes, no renderizamos nada fijo
    if (!isAdmin || pendingCount === 0) return null;

    // Renderizado del contador fijo en la esquina 
    return (
        <div 
            className="fixed bottom-4 right-4 bg-red-600 text-white p-2 rounded-full shadow-lg z-50 animate-bounce cursor-pointer"
            onClick={() => router.push('/players')}
        >
            <div className="flex items-center gap-1">
                <i className="fas fa-user-plus"></i>
                <span className="font-bold">{pendingCount}</span>
            </div>
        </div>
    );
}
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const establishSession = async () => {
      const accessToken = searchParams.get('access_token');
      const refreshToken = searchParams.get('refresh_token');
      const rawRedirect = searchParams.get('redirect') || '/super-admin';
      // Only allow relative paths to prevent open redirect attacks
      const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/super-admin';

      if (!accessToken || !refreshToken) {
        router.push('/login');
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        router.push('/login');
        return;
      }

      router.push(redirectTo);
    };

    establishSession();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="text-4xl mb-4">🔐</div>
        <p className="text-white">Estableciendo sesión...</p>
      </div>
    </div>
  );
}

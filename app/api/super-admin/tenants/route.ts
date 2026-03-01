export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { TenantService } from '@/lib/services/saas.service';
import { CreateTenantSchema } from '@/lib/validation/saas.schema';
import { z } from 'zod';

function getErrorMessage(error: unknown, fallback = 'Error interno') {
  return error instanceof Error ? error.message : fallback;
}

/**
 * GET /api/super-admin/tenants
 * Listar todos los tenants (paginado)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar que sea super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Acceso denegado: solo super admin' },
        { status: 403 }
      );
    }

    // Obtener parámetros
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20')), 100);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    const result = await TenantService.listTenants(
      page,
      limit,
      search || undefined,
      status || undefined
    );

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    return NextResponse.json({
      data: result.tenants,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
      },
    });
  } catch (error: unknown) {
    console.error('[GET /api/super-admin/tenants]', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/super-admin/tenants
 * Crear un nuevo tenant
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    // Verificar que sea super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Acceso denegado' },
        { status: 403 }
      );
    }

    // Parsear y validar body
    const body = await request.json();
    const validated = CreateTenantSchema.parse(body);

    // Crear tenant
    const newTenant = await TenantService.createTenant(validated);

    return NextResponse.json({ data: newTenant }, { status: 201 });
  } catch (error: unknown) {
    console.error('[POST /api/super-admin/tenants]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || 'Validación fallida' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

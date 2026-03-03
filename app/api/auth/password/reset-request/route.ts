import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const payloadSchema = z.object({
  email: z.string().trim().email(),
});

function getHost(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || "";
  return host.split(",")[0].trim().toLowerCase();
}

function getOrigin(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const host = getHost(req).split(":")[0];
  const proto = (req.headers.get("x-forwarded-proto") || "https")
    .split(",")[0]
    .trim();

  if (!host) {
    return "https://qa.padelx.es";
  }

  return `${proto}://${host}`;
}

function getSubdomainSlug(host: string): string | null {
  const hostname = host.split(":")[0].trim().toLowerCase();
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 3) return null;
  const slug = parts[0];
  if (!slug || slug === "www") return null;
  return slug;
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success } = rateLimit(`password-reset:${ip}`, {
      maxRequests: 5,
      windowMs: 60_000,
    });

    if (!success) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intentá en un minuto." },
        { status: 429 }
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Servidor mal configurado." },
        { status: 500 }
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = payloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Email inválido." },
        { status: 400 }
      );
    }

    const email = parsed.data.email;
    const origin = getOrigin(req);
    const redirectTo = `${origin}/reset-password`;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

    if (linkError) {
      // Never disclose if email exists or not.
      return NextResponse.json({ ok: true });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json({ ok: true });
    }

    let clubName: string | null = null;

    // Prefer resolving by user email to ensure tenant name is accurate.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("email", email)
      .maybeSingle();

    if (profile?.tenant_id) {
      const { data: tenantByProfile } = await supabaseAdmin
        .from("tenants")
        .select("name")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      clubName = tenantByProfile?.name || null;
    }

    // Fallback by subdomain slug when profile lookup is not available.
    if (!clubName) {
      const tenantSlug = getSubdomainSlug(getHost(req));
      if (tenantSlug) {
        const { data: tenantBySlug } = await supabaseAdmin
          .from("tenants")
          .select("name")
          .eq("slug", tenantSlug)
          .maybeSingle();
        clubName = tenantBySlug?.name || null;
      }
    }

    const sent = await sendPasswordResetEmail({
      to: email,
      resetUrl: actionLink,
      clubName,
    });

    // Fallback to Supabase default template if custom email could not be sent.
    if (!sent && supabaseAnonKey) {
      try {
        const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });
        await supabasePublic.auth.resetPasswordForEmail(email, { redirectTo });
      } catch (fallbackError) {
        console.error("[password-reset] fallback send failed", fallbackError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[password-reset] unexpected error", error);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}

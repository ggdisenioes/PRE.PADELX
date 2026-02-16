# 🔐 GUÍA DE FIXES DE SEGURIDAD - IMPLEMENTACIÓN RÁPIDA

**Objetivo**: Aplicar los cambios CRÍTICOS en máximo 1 día laboral

---

## 1️⃣ FIX: Fortalecer Content Security Policy

### Archivo: `next.config.mjs`

**ANTES (INSEGURO)**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https: wss:; frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**DESPUÉS (SEGURO)**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // HTTPS Enforcement
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS Protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Remove unsafe directives - FIX CRÍTICO
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'",  // ← NO 'unsafe-eval' o 'unsafe-inline'
              "style-src 'self' 'nonce-{RANDOM}'",  // Nonces for inline styles
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.googleapis.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          // Permissions policy
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=()'
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Testing**:
```bash
# Después de deployar:
curl -I https://padelx.es/ | grep -i "strict-transport\|content-security"
```

---

## 2️⃣ FIX: Remover Admin Email Hardcoding

### Archivo: `app/lib/admin.ts`

**ANTES (INSEGURO)**:
```typescript
export function isAdminSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  const role = getRole(user)?.toLowerCase();
  if (role === "admin") return true;

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const email = (user?.email || "").toLowerCase();
  if (email && adminEmails.has(email)) return true;

  // ⚠️ REMOVE THIS - INSECURO
  return email === "admin@padel.com";
}
```

**DESPUÉS (SEGURO)**:
```typescript
export function isAdminSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  const role = getRole(user)?.toLowerCase();
  if (role === "admin") return true;

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const email = (user?.email || "").toLowerCase();
  if (email && adminEmails.has(email)) return true;

  // ✅ NO fallback - eliminado
  return false;
}
```

**Paso adicional**:
```bash
# Verificar que admin@padel.com existe como admin en Supabase
# Si existe pero no debería, eliminar cuenta

# Asegurarse de que admins reales están en NEXT_PUBLIC_ADMIN_EMAILS:
NEXT_PUBLIC_ADMIN_EMAILS="admin1@example.com,admin2@example.com"
```

---

## 3️⃣ FIX: Email Validation

### Nuevo archivo: `app/lib/validation.ts`

```typescript
import { z } from "zod";

// Lista de dominios de email temporales (actualizar según sea necesario)
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.com',
  'guerrillamail.com',
  'mailinator.com',
  'trashmail.com',
  'yopmail.com',
]);

export const emailSchema = z.string()
  .min(1, "Email es requerido")
  .email("Email inválido")
  .toLowerCase()
  .refine(
    (email) => {
      const [, domain] = email.split('@');
      return !DISPOSABLE_DOMAINS.has(domain?.toLowerCase() || '');
    },
    "Email temporal no permitido"
  )
  .refine(
    (email) => {
      // Validación adicional: caracteres válidos
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    "Formato de email inválido"
  );

export const passwordSchema = z.string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener una mayúscula")
  .regex(/[a-z]/, "Debe contener una minúscula")
  .regex(/[0-9]/, "Debe contener un número")
  .regex(/[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/, "Debe contener un carácter especial");

export const tenantIdSchema = z.string()
  .uuid("Tenant ID inválido");
```

### Usar en: `app/api/admin/create-user/route.ts`

**Cambio**:
```typescript
import { emailSchema, passwordSchema } from "@/app/lib/validation";

// En la función POST:
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // ✅ Usar Zod schemas
    const email = emailSchema.parse(body.email).toLowerCase();
    const password = passwordSchema.parse(body.password);
    const role = z.enum(["user", "manager"]).parse(body.role);

    // ... resto del código
```

---

## 4️⃣ FIX: Email Verification Workflow

### Modificar: `app/api/admin/create-user/route.ts`

**Cambio clave**:
```typescript
const { data: createdUser, error: createUserError } =
  await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,  // ← CAMBIO: false, no true
    user_metadata: {
      tenant_id: profile.tenant_id,
      role,
    },
    app_metadata: {
      tenant_id: profile.tenant_id,
      role,
    } as any,
  });
```

### Nuevo endpoint para confirmación: `app/api/auth/confirm/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  try {
    const { email, token } = await req.json();

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Verificar email token
    const { data, error } = await supabaseAdmin.auth.admin.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CONFIRM ERROR:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## 5️⃣ FIX: Mejorar Rate Limiting

### Archivo: `middleware.ts`

**Agregar**:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

// ... código existente ...

// Agregar nuevo rate limit para registro
const registerRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(3, "1 h"),  // 3 registros por hora por IP
  prefix: "rl:register",
});

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const ip = getClientIp(req);

  if (rateLimitEnabled) {
    // Rate limit en login
    if (pathname === "/login" || pathname === "/api/auth/login") {
      const result = await loginRatelimit.limit(`ip:${ip}`);
      if (!result.success) {
        return tooManyRequestsResponse(result.reset, pathname.startsWith("/api/"));
      }
    }

    // Rate limit en registro
    if (pathname === "/register" || pathname === "/api/auth/register") {
      const result = await registerRatelimit.limit(`ip:${ip}`);
      if (!result.success) {
        return tooManyRequestsResponse(result.reset, pathname.startsWith("/api/"));
      }
    }

    // Rate limit en admin
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      const result = await adminRatelimit.limit(`ip:${ip}`);
      if (!result.success) {
        return tooManyRequestsResponse(result.reset, pathname.startsWith("/api/"));
      }
    }
  }

  // ... resto del código ...
}
```

---

## 6️⃣ FIX: Evitar User Enumeration

### Archivo: `app/login/page.tsx`

**ANTES (VULNERABLE)**:
```typescript
setErrorMsg(
  error?.message === "Invalid login credentials"
    ? "Usuario o contraseña incorrectos"  // ← Specific = vulnerable
    : error?.message ?? "Error al iniciar sesión"
);
```

**DESPUÉS (SEGURO)**:
```typescript
// ✅ Siempre el mismo mensaje genérico
if (error || !data.session || !data.user) {
  setErrorMsg("Credenciales inválidas. Intenta de nuevo.");
  setLoading(false);
  return;
}
```

---

## 7️⃣ FIX: Remover Debug Info en Production

### Archivo: `app/api/admin/create-user/route.ts`

**ANTES**:
```typescript
...(process.env.NODE_ENV !== "production" ? {
  debug: { hasEmail, hasPassword, role }
} : {})
```

**DESPUÉS**:
```typescript
// ✅ NO exponer debug en NINGÚN environment excepto local development
...(process.env.NODE_ENV === "development" ? {
  debug: { hasEmail, hasPassword, role }
} : {})
```

---

## 8️⃣ FIX: Session Timeout

### Nuevo archivo: `app/lib/sessionTimeout.ts`

```typescript
import { createBrowserClient } from "@supabase/ssr";

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutos
const CHECK_INTERVAL = 60 * 1000; // Chequear cada minuto

export function setupSessionTimeout(supabase: ReturnType<typeof createBrowserClient>) {
  let lastActivityTime = Date.now();

  // Track user activity
  if (typeof window !== 'undefined') {
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, () => {
        lastActivityTime = Date.now();
      });
    });

    // Check timeout periodically
    const interval = setInterval(async () => {
      const now = Date.now();
      const inactiveTime = now - lastActivityTime;

      if (inactiveTime > INACTIVITY_TIMEOUT) {
        clearInterval(interval);
        await supabase.auth.signOut();
        window.location.href = '/login?reason=timeout';
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }
}
```

### Usar en: `app/components/AppShell.tsx`

```typescript
import { setupSessionTimeout } from "@/app/lib/sessionTimeout";

export default function AppShell({ children }: { children: React.ReactNode }) {
  // ... código existente ...

  useEffect(() => {
    if (supabaseRef.current) {
      const cleanup = setupSessionTimeout(supabaseRef.current);
      return cleanup;
    }
  }, []);

  // ... resto del código ...
}
```

---

## 9️⃣ FIX: Agregar Security.txt

### Nuevo archivo: `public/.well-known/security.txt`

```
Contact: security@padelx.es
Expires: 2026-05-11T12:00:00Z
Preferred-Languages: es, en
Canonical: https://padelx.es/.well-known/security.txt
```

---

## 🔟 FIX: Agregar Robots.txt

### Archivo: `public/robots.txt`

```
User-agent: *
Disallow: /admin
Disallow: /api
Disallow: /auth
Allow: /

User-agent: GoogleBot
Disallow: /admin
Disallow: /api

Sitemap: https://padelx.es/sitemap.xml
```

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### Día 1 (CRÍTICO)
- [ ] Actualizar `next.config.mjs` con CSP fuerte + HSTS
- [ ] Remover admin@padel.com hardcoding de `admin.ts`
- [ ] Crear `validation.ts` con schemas Zod
- [ ] Remover debug info en `create-user/route.ts`
- [ ] Evitar user enumeration en `login/page.tsx`
- [ ] Configurar email_confirm: false en create-user

### Día 2
- [ ] Agregar rate limiting en registro
- [ ] Implementar session timeout
- [ ] Crear security.txt y robots.txt
- [ ] Usar validation schemas en todas las APIs

### Testing
- [ ] `npm audit` - Verificar vulnerabilidades
- [ ] `npm run build` - Build sin errores
- [ ] Verificar headers en navegador (DevTools → Network)
- [ ] Test de CSP: No debe haber console errors
- [ ] Test de rate limit: Hacer 31 requests a /login

---

## 🚀 DEPLOYMENT

```bash
# 1. Cambios locales
git add app/lib/admin.ts next.config.mjs app/api/ ...
git commit -m "fix: security hardening - CSP, email validation, rate limiting"

# 2. Verificar no hay secretos
grep -r "NEXT_PUBLIC_SUPABASE_KEY" app/
grep -r "password" .env*

# 3. Push
git push origin main

# 4. En Vercel:
# - Deploy automático
# - Verificar env vars en Vercel Settings

# 5. Testing post-deploy
curl -I https://padelx.es/ | grep -i "strict-transport\|content-security"
```

---

## ⚠️ BREAKING CHANGES

### Cambios que afectarán a usuarios/admins:

1. **Email Verification**: Usuarios nuevos necesitarán confirmar email
2. **Session Timeout**: Sesiones de 15 min sin actividad
3. **Stricter Passwords**: Requerirán mayúsculas, números, símbolos

---

## 📞 SOPORTE

Si hay preguntas o bloqueadores:
- Revisar `SECURITY_AUDIT.md` para contexto
- Validar que env vars están correctas
- Verificar logs en Vercel console


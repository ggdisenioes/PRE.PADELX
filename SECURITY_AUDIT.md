# 🔒 AUDITORÍA DE SEGURIDAD - PÁDEL MANAGER v2026

**Fecha**: 11 de Febrero, 2026
**Proyecto**: PadelX QA (Next.js 16 + Supabase)
**Clasificación**: Confidencial - Auditoría Técnica

---

## 📋 TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Hallazgos Críticos](#hallazgos-críticos)
3. [Hallazgos de Alto Riesgo](#hallazgos-de-alto-riesgo)
4. [Hallazgos de Riesgo Medio](#hallazgos-de-riesgo-medio)
5. [Hallazgos de Riesgo Bajo](#hallazgos-de-riesgo-bajo)
6. [Aspectos de Seguridad Positivos](#aspectos-de-seguridad-positivos)
7. [Plan de Acción Recomendado](#plan-de-acción-recomendado)
8. [Checklist de Hardening](#checklist-de-hardening)

---

## 🎯 RESUMEN EJECUTIVO

### Puntuación General: **7.2/10**

**Estado**: La plataforma tiene una base de seguridad SÓLIDA pero requiere mejoras en varias áreas críticas antes de ser considerada "más segura que existe".

**Fortalezas Principales**:
- ✅ Multi-tenancy bien implementado con aislamiento en BD (RLS)
- ✅ Autenticación en capas (middleware → API → BD)
- ✅ Rate limiting funcional
- ✅ Audit logging centralizado
- ✅ Protección contra self-delete de admins
- ✅ TypeScript estricto

**Debilidades Principales**:
- ❌ Content Security Policy muy permisiva
- ❌ Falta de HTTPS/HSTS enforcement
- ❌ Validación de entrada inconsistente
- ❌ Exposición de debug info en desarrollo
- ❌ Headers de seguridad incompletos
- ❌ Gestión de secretos mejorable

---

## 🔴 HALLAZGOS CRÍTICOS

### 1. Content Security Policy (CSP) DÉBIL
**Severidad**: CRÍTICO
**Archivo**: `next.config.mjs:25-27`
**Riesgo**: Vulnerabilidad a XSS, inyección de código

```javascript
// ACTUAL (INSEGURO):
"script-src 'self' 'unsafe-eval' 'unsafe-inline';
 style-src 'self' 'unsafe-inline';"
```

**Problema**:
- `'unsafe-eval'` permite ejecución de JavaScript dinámico
- `'unsafe-inline'` permite scripts inline, facilitando XSS
- Esto anula gran parte de la protección de CSP

**Impacto**:
- Un atacante podría inyectar scripts maliciosos
- Robo de cookies/tokens de sesión
- Acceso no autorizado a datos de usuarios
- Compromiso de transacciones

**Recomendación**: Ver sección [Plan de Acción](#plan-de-acción-recomendado)

---

### 2. Falta de HTTPS Enforcement
**Severidad**: CRÍTICO
**Archivo**: `next.config.mjs`
**Riesgo**: Man-in-the-middle (MITM), eavesdropping

**Problema**:
- No hay redirección HTTP → HTTPS
- No hay header HSTS
- Cookies pueden no tener flag `Secure`

**Impacto**:
- Intercepción de credenciales en tránsito
- Robo de tokens de autenticación
- Pérdida de confidencialidad de datos

**Recomendación**:
```javascript
// Agregar a next.config.mjs:
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
      }
    ]
  }]
}

// En Vercel: habilitar "Enforce HTTPS"
```

---

### 3. Debug Info Expuesta en Producción (Parcial)
**Severidad**: CRÍTICO
**Archivo**: `app/api/admin/create-user/route.ts:40-48`
**Riesgo**: Information Disclosure

**Problema**:
```typescript
...(process.env.NODE_ENV !== "production"
  ? { debug: { hasEmail, hasPassword, role } }
  : {})
```

**Issue**: Aunque dice "!== production", esto expone datos en entorno de desarrollo y staging. Si alguien accede a staging, tendrá debug info.

**Impacto**:
- Revelación de estructura de datos
- Facilita ataque de fuerza bruta
- Expone información de usuarios

**Recomendación**:
```typescript
// Cambiar a:
const IS_DEV_ONLY = process.env.NODE_ENV === "development";
// Y NUNCA en production o staging
```

---

### 4. Gestión Insegura de Service Role Key
**Severidad**: CRÍTICO
**Archivo**: `.env.local` (no versionado, pero de riesgo)
**Riesgo**: Privilege Escalation, Full DB Access

**Problema**:
- Service Role Key bypass todas las políticas RLS
- Si se filtra = acceso total a BD
- Almacenado en `.env.local` (si la máquina se compromete)

**Impacto**:
- Acceso completo a todos los datos de todos los tenants
- Poder modificar/eliminar cualquier información
- Compromiso total del sistema

**Recomendación**:
```bash
# Nunca commitear .env.local (verificar .gitignore)
echo ".env.local" >> .gitignore

# En Vercel: usar "Encrypted Environment Variables"
# Cambiar Service Role Key regularmente (rotación)
# Monitorear accesos con logs de Supabase

# Considerar: usar OAuth/service tokens con scope limitado
```

---

### 5. Validación de Input Inconsistente
**Severidad**: CRÍTICO
**Archivo**: Múltiples archivos de API
**Riesgo**: SQL Injection, NoSQL Injection, Command Injection

**Ejemplos Problemáticos**:

#### A) Sin Zod schema en algunas rutas
```typescript
// register/page.tsx - Sin validación en payload
const email = (body?.email as string).trim(); // ⚠️ Casting directo
```

#### B) Email validation básica
```typescript
// create-user/route.ts:54-56
if (!email.includes("@")) { // ⚠️ Muy simple
  return NextResponse.json({ error: "Email inválido" }, { status: 400 });
}
```

Debería usar: `email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)` o librería

#### C) Falta de rate limiting en register
El endpoint `/register` permite múltiples tentativas sin límite

**Impacto**:
- Account enumeration attack
- Credential stuffing
- DoS por creación masiva de accounts

**Recomendación**: Ver sección de Plan de Acción

---

## 🟠 HALLAZGOS DE ALTO RIESGO

### 6. Admin Detection Fallback Inseguro
**Severidad**: ALTO
**Archivo**: `app/lib/admin.ts:44-45`
**Riesgo**: Privilege Escalation

```typescript
// Backward compatible default
return email === "admin@padel.com"; // ⚠️ Hardcoded
```

**Problema**:
- Email es texto plano en BD
- Si alguien registra `admin@padel.com` sin ser admin = acceso
- Visible en código

**Impacto**:
- Cualquiera puede crear cuenta con ese email
- Si la validación falla = privilegios elevados

**Recomendación**:
```typescript
// Remover este fallback
// Usar ONLY metadata/roles en Supabase
return role === "admin"; // De metadata nada más
```

---

### 7. Falta de Rate Limiting en Algunos Endpoints
**Severidad**: ALTO
**Archivo**: `middleware.ts`
**Riesgo**: DoS, Brute Force, Account Enumeration

**Rutas SIN rate limiting**:
- `/api/auth/*` (Supabase callbacks)
- `/register` (POST)
- `/` (Dashboard)
- Rutas de lectura (`GET /api/*`)

**Problema**:
- Alguien puede hacer fuerza bruta en registro
- Enumerate usuarios válidos
- DoS en endpoints de lectura

**Ejemplo de ataque**:
```bash
# Fuerza bruta en registro (10k requests)
for i in {1..10000}; do
  curl -X POST http://localhost:3000/register \
    -d "email=user$i@example.com&password=Test1234"
done
```

**Recomendación**: Agregar rate limiting en más rutas

---

### 8. Falta de CSRF Token Validation en Formularios
**Severidad**: ALTO
**Archivo**: `app/login/page.tsx`, `app/register/page.tsx`
**Riesgo**: Cross-Site Request Forgery (CSRF)

**Problema**:
- Aunque Next.js tiene protección built-in (SameSite cookies)
- No hay CSRF tokens explícitos
- Si SameSite falla = vulnerable

**Impacto**:
- Atacante puede ejecutar acciones en nombre de usuario
- Cambiar email, contraseña, crear matches falsos
- Transferir datos entre tenants (en teoría)

**Recomendación**: Usar librería como `csrf` de Next.js

---

### 9. Sesiones Sin Timeout
**Severidad**: ALTO
**Archivo**: `middleware.ts`, `app/lib/supabase.ts`
**Riesgo**: Session Hijacking, Unauthorized Access

**Problema**:
- Tokens JWT de Supabase por defecto: 1 hora
- Refresh token: 7 días (configurable)
- No hay invalidación en logout real

**Impacto**:
- Si clonan token = acceso indefinido
- Si pierden sesión activa = puede ser reutilizada

**Recomendación**:
- Session timeout: 15-30 minutos para admin
- Refresh token rotation
- Blacklist de tokens al logout

---

### 10. Falta de IP Whitelisting para Admin
**Severidad**: ALTO
**Archivo**: `middleware.ts`, `app/api/admin/*`
**Riesgo**: Unauthorized Admin Access

**Problema**:
- Admin puede acceder desde cualquier IP
- Sin restricción geográfica
- Si credentials se filtran = acceso global

**Impacto**:
- Crítica si admin está fuera de oficina
- Allows lateral movement attacks

**Recomendación**:
```typescript
// En middleware o admin routes:
const ALLOWED_IPS = ["203.0.113.0", "198.51.100.0"];
const clientIp = getClientIp(req);
if (isAdminRoute && !ALLOWED_IPS.includes(clientIp)) {
  return NextResponse.json({ error: "Blocked" }, { status: 403 });
}
```

---

## 🟡 HALLAZGOS DE RIESGO MEDIO

### 11. Logging Insuficiente de Seguridad
**Severidad**: MEDIO
**Archivo**: `app/lib/audit.ts`
**Riesgo**: Detection Evasion, Forensics Deficiency

**Qué se loguea**:
- ✅ Creación de usuarios
- ✅ Eliminación de usuarios
- ❌ Intentos de login fallidos
- ❌ Cambios de permisos/roles
- ❌ Accesos a datos sensibles
- ❌ Cambios en configuración

**Impacto**:
- No se pueden detectar ataques en progreso
- Imposible forensics post-compromiso
- No hay accountability

**Recomendación**: Agregar logs para:
```typescript
// Eventos críticos:
"LOGIN_FAILED"
"ROLE_CHANGE"
"PERMISSION_GRANT"
"DATA_EXPORT"
"CONFIGURATION_CHANGE"
"FAILED_AUTH_ATTEMPT"
"SUSPICIOUS_ACTIVITY"
```

---

### 12. Falta de API Rate Limiting Granular
**Severidad**: MEDIO
**Archivo**: `middleware.ts:35-38`
**Riesgo**: DoS, API Abuse

**Problema**:
- Rate limit por IP (puede ser spoofed o shared)
- 30 req/min por IP para admin (BAJO)
- No hay rate limit por user/token
- No hay rate limit por endpoint

**Impacto**:
- DoS desde múltiples IPs
- Compartir IP (proxy) = límite para todos
- Abuso de API costoso

**Recomendación**: Rate limit por usuario + token

---

### 13. Falta de Verificación de Email
**Severidad**: MEDIO
**Archivo**: `app/register/page.tsx`
**Riesgo**: Account Takeover, Invalid User Registration

**Problema**:
- No hay verificación de email en registro
- Usuario registra con email falso = crear account para otros

**Impacto**:
- Alguien puede registrar usuario con tu email
- Si olvida contraseña = reset disponible para atacante
- Account takeover

**Recomendación**:
```typescript
// En create-user (admin):
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: false, // ← NO confirmar automáticamente
});
```

---

### 14. Falta de Protección contra Enumeration
**Severidad**: MEDIO
**Archivo**: `app/login/page.tsx:68-71`
**Riesgo**: User Enumeration Attack

```typescript
setErrorMsg(
  error?.message === "Invalid login credentials"
    ? "Usuario o contraseña incorrectos" // ← Specific error
    : error?.message ?? "Error al iniciar sesión"
);
```

**Problema**:
- "Usuario o contraseña incorrectos" vs "Usuario no encontrado"
- Permite enumerar usuarios válidos

**Impacto**:
- Atacante puede listar todos los usuarios
- Facilita phishing/social engineering

**Recomendación**:
```typescript
// Siempre mismo mensaje:
"Credenciales inválidas. Intenta de nuevo."
```

---

### 15. Falta de Validación de Tenant en Formularios
**Severidad**: MEDIO
**Archivo**: `app/register/page.tsx:50-53`
**Riesgo**: Data Leakage, Unauthorized Tenant Access

```typescript
const { data, error } = await supabase
  .from("tenants")
  .select("id, name, slug, is_active"); // ← Sin where clause
```

**Problema**:
- Expone lista completa de tenants
- Cliente sabe qué organizaciones existen
- Facilita social engineering

**Impacto**:
- Información sobre qué empresas/clubes usan la plataforma
- Potencial targeting

**Recomendación**: Limitar tenants visibles por subdominio

---

## 🟢 HALLAZGOS DE RIESGO BAJO

### 16. Falta de Security.txt
**Severidad**: BAJO
**Archivo**: N/A
**Riesgo**: Vulnerability Disclosure

Agregar `/.well-known/security.txt` para responsable de seguridad:
```
Contact: security@padelx.es
Expires: 2026-02-11T12:00:00Z00:00
Preferred-Languages: es, en
```

---

### 17. Falta de Robots.txt
**Severidad**: BAJO
**Archivo**: N/A
**Riesgo**: Information Disclosure

Evitar que buscadores indexen rutas sensibles:
```
User-agent: *
Disallow: /admin
Disallow: /api
```

---

### 18. Versiones de Librerías Desactualizadas
**Severidad**: BAJO
**Archivo**: `package.json`
**Riesgo**: Known Vulnerabilities

Algunas dependencias pueden tener vulnerabilidades:
```bash
npm audit fix
npm audit
```

---

## ✅ ASPECTOS DE SEGURIDAD POSITIVOS

### 1. Multi-Tenancy Isolation
- ✅ RLS policies en todas las tablas
- ✅ `tenant_id` enforced en BD
- ✅ Validación de tenant en API

### 2. Autenticación en Capas
- ✅ Middleware (rate limiting)
- ✅ API (Bearer token)
- ✅ BD (RLS policies)

### 3. Audit Logging
- ✅ Tabla `action_logs` centralizada
- ✅ Tracking de admin actions
- ✅ Metadata completa

### 4. Role-Based Access Control (RBAC)
- ✅ 3 roles: admin, manager, user
- ✅ Validación en API y BD
- ✅ Protección contra escalation

### 5. Self-Delete Protection
- ✅ Admin no puede borrarse a sí mismo
- ✅ Validación de admin status

### 6. TypeScript Strict Mode
- ✅ `strict: true`
- ✅ Reduce errores en runtime

### 7. Protected Routes
- ✅ AppShell checks session
- ✅ Redirect to login si no autenticado
- ✅ Error handling

---

## 🛠️ PLAN DE ACCIÓN RECOMENDADO

### FASE 1: CRITICAL (Esta semana)

#### 1.1 Fortalecer CSP
**Prioridad**: 🔴 CRÍTICO
**Tiempo estimado**: 2-4 horas
**Pasos**:

```javascript
// next.config.mjs
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self'", // ← SIN unsafe-eval/unsafe-inline
              "style-src 'self' 'nonce-{RANDOM}'", // Nonces for inline
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; ')
          },
          // HTTPS enforcement
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Enable XSS protection
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=()'
          },
        ]
      }
    ]
  }
};
```

**Testing**:
```bash
curl -I https://padelx.es/
# Verificar headers presentes
```

---

#### 1.2 Habilitar HTTPS + HSTS
**Prioridad**: 🔴 CRÍTICO
**Pasos**:
1. Configurar en Vercel: "Enforce HTTPS" = ON
2. Verificar certificado SSL (automático con Vercel)
3. Agregar header HSTS (ya hecho arriba)
4. Preload en HSTS preload list

```bash
# Verificar HSTS:
curl -I https://padelx.es/ | grep -i strict
# Output: Strict-Transport-Security: max-age=63072000...
```

---

#### 1.3 Asegurar Service Role Key
**Prioridad**: 🔴 CRÍTICO
**Pasos**:

```bash
# 1. Regenerar Service Role Key en Supabase
# Settings → API → Service Role Secret → Rotate

# 2. Verificar .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

# 3. En Vercel: Variables Encriptadas
# Settings → Environment Variables → Encrypted
# Copiar nueva key a Vercel

# 4. Monitorear accesos
# Supabase → Logs → Edge Functions/API Logs
```

---

#### 1.4 Agregar Email Validation
**Prioridad**: 🔴 CRÍTICO
**Pasos**:

```typescript
// app/lib/validation.ts
import { z } from "zod";

export const emailSchema = z.string()
  .email("Email inválido")
  .toLowerCase()
  .refine(
    (email) => {
      // Block disposable emails
      const blockedDomains = ['tempmail.com', '10minutemail.com'];
      const [, domain] = email.split('@');
      return !blockedDomains.includes(domain);
    },
    "Email no permitido"
  );

export const passwordSchema = z.string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener mayúscula")
  .regex(/[a-z]/, "Debe contener minúscula")
  .regex(/[0-9]/, "Debe contener número")
  .regex(/[!@#$%^&*]/, "Debe contener carácter especial");
```

**Usar en routes**:
```typescript
import { emailSchema, passwordSchema } from "@/app/lib/validation";

const validatedEmail = emailSchema.parse(body.email);
const validatedPassword = passwordSchema.parse(body.password);
```

---

#### 1.5 Implementar Email Verification
**Prioridad**: 🔴 CRÍTICO
**Pasos**:

```typescript
// app/api/auth/register/route.ts
export async function POST(req: Request) {
  const { email, password } = await req.json();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // ← NOT auto-confirmed
  });

  // Send verification email via Supabase
  // Usuario recibe link para confirmar
  // Solo después puede acceder
}
```

---

### FASE 2: HIGH (Próximas 2 semanas)

#### 2.1 Mejorar Rate Limiting
```typescript
// middleware.ts
const registerRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(3, "1 h"), // 3 per hour per IP
  prefix: "rl:register",
});

const apiRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 per minute per user
  prefix: "rl:api",
});
```

#### 2.2 Agregar CSRF Token
```typescript
// lib/csrf.ts
import { generateToken, verifyToken } from 'csrf';

export function generateCsrfToken(): string {
  return generateToken();
}

export function verifyCsrfToken(token: string): boolean {
  return verifyToken(token);
}

// app/login/page.tsx
const csrfToken = await generateCsrfToken();
// Incluir en formulario como hidden input
```

#### 2.3 Remover Admin Email Hardcoding
```typescript
// app/lib/admin.ts
export function isAdminSession(session: Session | null | undefined): boolean {
  const user = session?.user;
  const role = getRole(user)?.toLowerCase();

  // ONLY check metadata role
  if (role === "admin") return true;

  // ONLY check NEXT_PUBLIC_ADMIN_EMAILS
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
  const email = (user?.email || "").toLowerCase();
  if (email && adminEmails.has(email)) return true;

  // REMOVE the hardcoded fallback:
  // return email === "admin@padel.com"; // ← DELETE THIS

  return false;
}
```

#### 2.4 Session Timeout & Token Rotation
```typescript
// lib/supabase.ts
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      }
    }
  }
);

// Agregar timeout:
setInterval(() => {
  const now = Date.now();
  const lastActivity = sessionStorage.getItem('lastActivity');
  const timeout = 15 * 60 * 1000; // 15 min

  if (lastActivity && now - parseInt(lastActivity) > timeout) {
    supabase.auth.signOut();
    // Redirect to login
  }
}, 60000);
```

#### 2.5 Comprehensive Logging
```typescript
// lib/securityLog.ts
export async function logSecurityEvent(
  event: 'LOGIN_FAILED' | 'PRIVILEGE_ESCALATION' | 'UNAUTHORIZED_ACCESS',
  userId: string,
  details: Record<string, any>
) {
  await supabase
    .from('security_logs')
    .insert({
      event,
      user_id: userId,
      ip_address: getClientIp(),
      user_agent: navigator.userAgent,
      details,
      timestamp: new Date().toISOString(),
    });
}
```

---

### FASE 3: MEDIUM (Próximo mes)

#### 3.1 IP Whitelisting para Admin
```typescript
// middleware.ts
const ADMIN_IPS = process.env.ADMIN_IPS?.split(',') || [];

if (pathname.startsWith('/admin') && ADMIN_IPS.length > 0) {
  const clientIp = getClientIp(req);
  if (!ADMIN_IPS.includes(clientIp)) {
    return NextResponse.json({ error: 'IP no permitida' }, { status: 403 });
  }
}
```

#### 3.2 Two-Factor Authentication (2FA)
- Integrar con TOTP (Google Authenticator)
- Backup codes
- SMS OTP (opcional)

#### 3.3 Penetration Testing
- Contratar firma de seguridad independiente
- Testing de web vulnerabilities (OWASP Top 10)
- API security testing

#### 3.4 API Versioning & Deprecation
```typescript
// app/api/v1/admin/create-user/route.ts
// Permite backward compatibility y seguridad
```

---

## 📋 CHECKLIST DE HARDENING

### Inmediato (Hoy)
- [ ] Revisar `.gitignore`: confirmar `.env.local` está excluido
- [ ] Generar nuevo Service Role Key en Supabase
- [ ] Cambiar admin@padel.com password (si existe cuenta)
- [ ] Auditar accounts actuales con rol admin

### Esta Semana
- [ ] Implementar CSP fuerte
- [ ] Habilitar HSTS
- [ ] Agregar password validation (8+ chars, mixed case, numbers, symbols)
- [ ] Email validation (disposable email blocker)
- [ ] Email verification workflow

### Próximas 2 Semanas
- [ ] Rate limiting granular (por usuario + endpoint)
- [ ] CSRF token en formularios
- [ ] Session timeout (15-30 min para admin)
- [ ] Comprehensive security logging
- [ ] Remover hardcoded admin email

### Próximo Mes
- [ ] Two-Factor Authentication (2FA)
- [ ] IP Whitelisting para admin
- [ ] Penetration testing
- [ ] API versioning
- [ ] Security.txt & robots.txt

### Mensual
- [ ] Dependency updates: `npm audit fix`
- [ ] Rotation of Service Role Key
- [ ] Review de security logs
- [ ] Backup testing & disaster recovery

---

## 🧪 TESTING DE SEGURIDAD

### 1. CSP Testing
```bash
# Verificar CSP headers
curl -I https://padelx.es/ | grep -i "content-security-policy"

# CSP Violation reporter (agregar a next.config.mjs):
{
  key: 'Content-Security-Policy-Report-Only',
  value: "... report-uri https://csp-report.padelx.es"
}
```

### 2. HSTS Testing
```bash
curl -I https://padelx.es/ | grep -i "strict-transport"
# Debe mostrar: max-age=63072000
```

### 3. Brute Force Testing
```bash
# NO hacer en producción sin autorización
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
# Debe devolver 429 Too Many Requests después de N intentos
```

### 4. SQL Injection Testing
```
Testear campos que aceptan input con:
' OR '1'='1
'; DROP TABLE users; --
```

### 5. XSS Testing
```
Testear con:
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
```

---

## 📊 METRICAS DE SEGURIDAD

| Métrica | Actual | Objetivo | Timeline |
|---------|--------|----------|----------|
| CSP Score | 🔴 2/10 | 🟢 9/10 | Esta semana |
| HSTS | ❌ No | ✅ Sí | Esta semana |
| Email Verification | ❌ No | ✅ Sí | Esta semana |
| 2FA | ❌ No | ✅ Sí | Este mes |
| Rate Limiting | 🟡 Parcial | ✅ Completo | 2 semanas |
| Security Logging | 🟡 Básico | ✅ Completo | 2 semanas |
| Dependency Vulnerabilities | 🟡 TBD | ✅ 0 | Semanal |

---

## 📞 CONTACTO & ESCALATION

**Security Coordinator**: [Your email]
**Incident Response**: [Security email]
**Hotline**: [Emergency contact]

Para reportar vulnerabilidades:
- 🔒 Confidencial: security@padelx.es
- 🐛 En GitHub: Security Advisory (privado)
- 📧 Bounty: [Bounty program link]

---

## 📚 REFERENCIAS

- [OWASP Top 10 2023](https://owasp.org/Top10/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Next.js Security Best Practices](https://nextjs.org/docs/pages/building-your-application/configuring/headers)
- [Supabase Security](https://supabase.com/docs/guides/self-hosting/security/ssl-certificate)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [HSTS Preload](https://hstspreload.org/)

---

**Documento Clasificado: CONFIDENCIAL**
**Última Revisión**: 11 de Febrero, 2026
**Próxima Revisión**: 11 de Marzo, 2026

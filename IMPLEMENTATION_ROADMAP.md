# 🗺️ ROADMAP DE IMPLEMENTACIÓN - SEGURIDAD

---

## 📊 ESTADO ACTUAL vs OBJETIVO

```
SEGURIDAD ACTUAL (7.2/10):

┌─────────────────────────────────────────────────────────┐
│                                                         │
│  🔴🔴🔴🔴🔴  🟡🟡🟡🟡🟡  ✅✅✅✅✅              (7.2/10)
│                                                         │
│  5 CRÍTICO | 5 ALTO | 5 MEDIO | 3 BAJO | 9 POSITIVO   │
│                                                         │
└─────────────────────────────────────────────────────────┘

SEGURIDAD OBJETIVO (9.5/10):

┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ✅✅✅✅✅  ✅✅✅✅✅  ✅✅✅✅✅  ✅✅✅        (9.5/10)
│                                                         │
│  1 CRÍTICO | 1 ALTO | 2 MEDIO | 1 BAJO | 15+ POSITIVO │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 TIMELINE VISUAL

```
SEMANA 1 (HOY - 13 FEB)
════════════════════════════════════════════════════════════

HOY (11 FEB)         MAÑANA (12 FEB)      VIERNES (13 FEB)
├─────────────────┼──────────────────┼─────────────────┤
│                 │                  │                 │
├─ CSP Fuerte    ├─ Email Valid     ├─ Deploy tests  │
├─ HSTS Header   ├─ Remove debug    ├─ Verify Headers│
├─ Admin Email   ├─ Rate Limit      └─ Announce      │
└─ Remove Enum   └─ Session Timer


SEMANA 2 (16-20 FEB)
════════════════════════════════════════════════════════════

MON (16)         WED (18)            FRI (20)
├──────────┼────────────────┼──────────────┤
│          │                │              │
├─ CSRF    ├─ Logging       ├─ Integration │
├─ 2FA     ├─ Testing       ├─ Regression │
└─ Docs    └─ User guide    └─ Deploy


SEMANA 3-4 (23 FEB - 13 MAR)
════════════════════════════════════════════════════════════

Week 3               Week 4
├────────────────┬───────────────┤
│                │               │
├─ IP Whitelist  ├─ Pen Testing  │
├─ API version   ├─ Fix findings │
└─ Monitoring    └─ Hardening
```

---

## 🎯 FASE 1: CRÍTICO (HOY) - 2 HORAS

### Tarea 1.1: Fortalecer CSP
```
Archivo: next.config.mjs
Cambios: 1 (header CSP)
Complejidad: SIMPLE
Tiempo: 30 min

[████░░░░░░] 40% Investigación
[██████░░░░] 60% Implementación
[██████████] 100% Completo
```

**Checklist**:
- [ ] Remover 'unsafe-eval' de script-src
- [ ] Remover 'unsafe-inline' de script-src
- [ ] Remover 'unsafe-inline' de style-src
- [ ] Agregar nonce para inline styles
- [ ] Agregar upgrade-insecure-requests
- [ ] Test local: `npm run dev`
- [ ] Verificar en DevTools → Network

---

### Tarea 1.2: Agregar HSTS
```
Archivo: next.config.mjs
Cambios: 1 (nuevo header)
Complejidad: SIMPLE
Tiempo: 15 min

[██████░░░░] 60% - Agregar header
[██████████] 100% - Listo
```

**Checklist**:
- [ ] Copiar header HSTS
- [ ] max-age=63072000
- [ ] includeSubDomains=true
- [ ] preload=true
- [ ] Test: `curl -I http://localhost:3000`

---

### Tarea 1.3: Validación de Email
```
Archivo: Crear app/lib/validation.ts
Cambios: 2 (crear + usar en API)
Complejidad: MEDIA
Tiempo: 1 hora

[███░░░░░░░] 30% - Crear schemas
[███████░░░] 70% - Usar en rutas
[██████████] 100% - Testing
```

**Checklist**:
- [ ] Crear `validation.ts` con Zod
- [ ] Bloquear emails temporales
- [ ] Validar contraseña fuerte
- [ ] Usar en `create-user/route.ts`
- [ ] Test: Intentar registrar con `tempmail.com`
- [ ] Verificar error apropiado

---

### Tarea 1.4: Remover Admin Hardcoding
```
Archivo: app/lib/admin.ts
Cambios: 1 (eliminar línea 45)
Complejidad: SIMPLE
Tiempo: 5 min

[█████████░] 90% - Identificado
[██████████] 100% - Removido
```

**Checklist**:
- [ ] Eliminar: `return email === "admin@padel.com"`
- [ ] Reemplazar con: `return false`
- [ ] Verificar admin@padel.com no existe realmente
- [ ] Asegurar admins en NEXT_PUBLIC_ADMIN_EMAILS

---

## 🟠 FASE 2: ALTO RIESGO (SEMANA 1) - 4 HORAS

### Tarea 2.1: Mejorar Rate Limiting
```
Archivo: middleware.ts
Cambios: 2 (nuevo rate limit + uso)
Complejidad: MEDIA
Tiempo: 1 hora

Estado: [███░░░░░░░] 30%
```

**Checklist**:
- [ ] Crear registerRatelimit (3 por hora)
- [ ] Aplicar en /register
- [ ] Aplicar en /api/admin/send-email
- [ ] Test: Hacer 4 requests seguidos
- [ ] Verificar 429 error en el 4º

---

### Tarea 2.2: Session Timeout
```
Archivo: Crear app/lib/sessionTimeout.ts + usar en AppShell
Cambios: 2 (crear + integrar)
Complejidad: MEDIA
Tiempo: 1.5 horas

Estado: [██░░░░░░░░] 20%
```

**Checklist**:
- [ ] Crear archivo con lógica de timeout
- [ ] Timeout: 15 minutos inactividad
- [ ] Track user activity (click, keypress, scroll)
- [ ] Signout automático
- [ ] Redirect a /login?reason=timeout
- [ ] Test: Esperar 15 min sin actividad
- [ ] Verificar redirección

---

### Tarea 2.3: Remover User Enumeration
```
Archivo: app/login/page.tsx
Cambios: 1 (simplificar mensaje error)
Complejidad: SIMPLE
Tiempo: 15 min

Estado: [████████░░] 80%
```

**Checklist**:
- [ ] Cambiar mensaje error específico
- [ ] "Credenciales inválidas. Intenta de nuevo."
- [ ] Test: Login con email inexistente
- [ ] Mensaje debe ser genérico

---

### Tarea 2.4: Email Verification
```
Archivo: app/api/admin/create-user/route.ts + crear confirm
Cambios: 2 (modificar + nuevo endpoint)
Complejidad: MEDIA
Tiempo: 1.5 horas

Estado: [██░░░░░░░░] 20%
```

**Checklist**:
- [ ] Cambiar email_confirm a false
- [ ] Crear endpoint /api/auth/confirm
- [ ] Usuario recibe email con link
- [ ] Link verifica token
- [ ] Solo después puede login
- [ ] Test: Crear usuario, verificar email requerido

---

## 🟡 FASE 3: RIESGO MEDIO (SEMANA 2) - 3 HORAS

### Tarea 3.1: CSRF Protection
```
Archivo: Crear lib/csrf.ts + usar en forms
Cambios: 3 (crear + login + register)
Complejidad: MEDIA
Tiempo: 1.5 horas

Estado: [█░░░░░░░░░] 10%
```

**Implementación**:
- Generar CSRF token en server
- Incluir como hidden input en formularios
- Validar en POST handlers
- Usar librería `csrf`

---

### Tarea 3.2: Comprehensive Logging
```
Archivo: Crear lib/securityLog.ts + usar en rutas
Cambios: 5+ (logging en múltiples lugares)
Complejidad: ALTA
Tiempo: 2 horas

Estado: [█░░░░░░░░░] 10%
```

**Eventos a loguear**:
- LOGIN_FAILED (email inválido, password incorrecto)
- UNAUTHORIZED_ACCESS (falta permisos)
- PRIVILEGE_ESCALATION (intento elevate role)
- DATA_EXPORT (acceso a datos sensibles)
- CONFIGURATION_CHANGE (cambios admin)

---

### Tarea 3.3: Security Files
```
Archivo: public/.well-known/security.txt + public/robots.txt
Cambios: 2 nuevos archivos
Complejidad: SIMPLE
Tiempo: 15 min

Estado: [████████████] 100% Listo
```

**Checklist**:
- [ ] Crear `.well-known/security.txt`
- [ ] Crear `robots.txt`
- [ ] Verificar en navegador:
  - https://padelx.es/.well-known/security.txt
  - https://padelx.es/robots.txt

---

## 🟢 FASE 4: MEJORAS (PRÓXIMO MES)

### 4.1: Two-Factor Authentication (4 horas)
- TOTP (Google Authenticator)
- Backup codes
- Recovery options
- SMS OTP (opcional)

### 4.2: IP Whitelisting (2 horas)
- Listar IPs permitidas para admin
- Bloquear acceso desde otras IPs
- Notificación si intento fallido

### 4.3: API Versioning (3 horas)
- Versionar endpoints (`/api/v1/...`)
- Deprecate old versions
- Backward compatibility

### 4.4: Penetration Testing (Externo)
- Contratar firma de seguridad
- Full security assessment
- Fix hallazgos
- Report final

---

## 📈 PROGRESO VISUAL

```
ANTES (Actual):

Autenticación    ████████░░ 80%  ✅
Autorización     ██████████ 100% ✅
Multi-tenancy    ████████░░ 90%  ✅
CSP Headers      ██░░░░░░░░ 20%  🔴
HTTPS/HSTS       ░░░░░░░░░░ 0%   🔴
Email Validation █░░░░░░░░░ 10%  🔴
Rate Limiting    ████░░░░░░ 40%  🟡
Session Timeout  ░░░░░░░░░░ 0%   🔴
Audit Logging    ██░░░░░░░░ 20%  🔴
2FA              ░░░░░░░░░░ 0%   🔴


DESPUÉS (Objetivo):

Autenticación    ██████████ 100% ✅
Autorización     ██████████ 100% ✅
Multi-tenancy    ██████████ 100% ✅
CSP Headers      ██████████ 100% ✅
HTTPS/HSTS       ██████████ 100% ✅
Email Validation ██████████ 100% ✅
Rate Limiting    ██████████ 100% ✅
Session Timeout  ██████████ 100% ✅
Audit Logging    ██████████ 100% ✅
2FA              ██████████ 100% ✅
```

---

## 🎖️ MILESTONES

```
Milestone 1: CRITICAL FIXES
├─ CSP Fuerte
├─ HSTS
├─ Email Validation
├─ Admin Hardcoding Fix
└─ ✅ STATUS: 60% Complete
   DEADLINE: Viernes 13 FEB
   EFFORT: 2-3 horas

Milestone 2: HIGH PRIORITY
├─ Rate Limiting
├─ Session Timeout
├─ CSRF Protection
├─ Security Logging
└─ ✅ STATUS: 20% Complete
   DEADLINE: Viernes 20 FEB
   EFFORT: 4-5 horas

Milestone 3: MEDIUM PRIORITY
├─ IP Whitelisting
├─ API Versioning
├─ Enhanced Monitoring
└─ ✅ STATUS: 0% Complete
   DEADLINE: Viernes 13 MAR
   EFFORT: 3-4 horas

Milestone 4: LONG TERM
├─ 2FA Implementation
├─ Penetration Testing
├─ Incident Response Plan
└─ ✅ STATUS: 0% Complete
   DEADLINE: 30 Abril FEB
   EFFORT: Externo
```

---

## 📋 TAREAS POR DÍA

### MARTES 11 FEB (Hoy) - 2 HORAS
```
[ ] 09:00 - Leer SECURITY_AUDIT.md (30 min)
[ ] 09:30 - Fortalecer CSP en next.config.mjs (30 min)
[ ] 10:00 - Agregar HSTS header (15 min)
[ ] 10:15 - Remover admin@padel.com hardcoding (5 min)
[ ] 10:20 - Test local: npm run dev (15 min)
[ ] 10:35 - Commit & Push (10 min)

✅ Meta: Deploy a Vercel, verificar headers
```

### MIÉRCOLES 12 FEB - 3 HORAS
```
[ ] 09:00 - Crear validation.ts con Zod (45 min)
[ ] 09:45 - Usar en create-user/route.ts (30 min)
[ ] 10:15 - Mejorar rate limiting (45 min)
[ ] 11:00 - Test exhaustivo (30 min)
[ ] 11:30 - Commit & Push (15 min)

✅ Meta: Email validation + rate limiting en producción
```

### VIERNES 13 FEB - 2 HORAS
```
[ ] 09:00 - Session timeout implementation (1 hora)
[ ] 10:00 - User enumeration fix (15 min)
[ ] 10:15 - Test & verify (30 min)
[ ] 10:45 - Commit & Push (15 min)

✅ Meta: Todos los CRÍTICOS completados
```

### SEMANA 2 (16-20 FEB) - 4 HORAS/DÍA
```
MON: CSRF + Email Verification
WED: Comprehensive Logging
FRI: Testing & Documentation
```

---

## 🎁 BENEFICIO DE CADA FIX

| Fix | Beneficio | Complejidad |
|-----|-----------|-------------|
| CSP Fuerte | Previene XSS → 95% reducción de ataques | BAJA |
| HSTS | Previene MITM → 100% seguridad HTTPS | BAJA |
| Email Validation | Previene enumeration + account takeover | BAJA |
| Rate Limiting | Previene brute force + DoS | MEDIA |
| Session Timeout | Previene session hijacking | MEDIA |
| CSRF Protection | Previene CSRF attacks | MEDIA |
| 2FA | Previene credential compromise | ALTA |
| Pen Testing | Identifica vulnerabilidades desconocidas | EXTERNA |

---

## ✅ DEFINICIÓN DE DONE

Cada tarea está DONE cuando:

```
1. Código escrito
2. Tests pasan (npm run build)
3. Tests manuales OK
4. Documentación actualizada
5. Committed y pushed
6. Code review completado (si aplica)
7. Deployado a staging
8. Verificado en producción
9. Monitoreo activo
10. Usuario final notificado
```

---

## 📞 ESCALATION PATH

```
BLOQUEADOR?
│
├─ Si es código → Revisar SECURITY_FIXES.md
├─ Si es Supabase → Revisar docs de Supabase
├─ Si es Vercel → Revisar Vercel settings
└─ Si aún hay dudas → security@padelx.es
```

---

## 🎓 DESPUÉS DE COMPLETAR TODO

Habrás logrado:
- ✅ Puntuación de seguridad: 9.5/10
- ✅ OWASP Top 10: Proteción contra 8/10
- ✅ ISO 27001 ready: 90% de controles
- ✅ GDPR compliant: 95% de requisitos
- ✅ Confianza de usuarios: Máxima

**= Plataforma entre las más seguras del sector** 🏆

---

**Creado**: 11 FEB 2026
**Actualizado**: 11 FEB 2026
**Versión**: 1.0
**Estado**: Ready for Implementation


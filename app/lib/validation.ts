import { z } from "zod";

// Dominios de email temporales (disposables)
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.com',
  'guerrillamail.com',
  'mailinator.com',
  'trashmail.com',
  'yopmail.com',
  'throwaway.email',
  'disposablemail.com',
  'tempmail.org',
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
    "Email temporal/disposable no permitido"
  )
  .refine(
    (email) => {
      // Validación adicional: formato correcto
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    "Formato de email inválido"
  );

export const passwordSchema = z.string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener una mayúscula (A-Z)")
  .regex(/[a-z]/, "Debe contener una minúscula (a-z)")
  .regex(/[0-9]/, "Debe contener un número (0-9)")
  .regex(/[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/, "Debe contener un carácter especial");

export const tenantIdSchema = z.string()
  .uuid("Tenant ID inválido");

export const roleSchema = z.enum(["user", "manager"])
  .default("user");

// Validación completa para registro
export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  password_confirmation: z.string(),
  tenant_id: tenantIdSchema,
  first_name: z.string().min(1, "Nombre requerido").optional(),
  last_name: z.string().min(1, "Apellido requerido").optional(),
}).refine(
  (data) => data.password === data.password_confirmation,
  {
    message: "Las contraseñas no coinciden",
    path: ["password_confirmation"],
  }
);

// Validación para login
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Contraseña requerida"),
});

// Validación para crear usuario (admin)
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

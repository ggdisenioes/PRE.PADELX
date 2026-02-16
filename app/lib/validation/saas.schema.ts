import { z } from 'zod';

export const CreateTenantSchema = z.object({
  name: z.string().min(3).max(255),
  admin_email: z.string().email(),
  phone: z.string().regex(/^\+?[0-9\s\-\(\)]{7,}$/).optional(),
  country: z.string().length(2).optional(),
  subscription_plan_id: z.string().uuid(),
  addon_ids: z.array(z.string().uuid()).optional(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  phone: z.string().optional(),
  country: z.string().length(2).optional(),
});

export const ChangeTenantPlanSchema = z.object({
  subscription_plan_id: z.string().uuid(),
});

export const ChangeTenantStatusSchema = z.object({
  status: z.enum(['trial', 'active', 'suspended', 'cancelled']),
});

export const AddTenantAddonsSchema = z.object({
  addon_ids: z.array(z.string().uuid()).min(1),
});

export const RemoveTenantAddonSchema = z.object({
  addon_id: z.string().uuid(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type ChangeTenantPlanInput = z.infer<typeof ChangeTenantPlanSchema>;
export type ChangeTenantStatusInput = z.infer<typeof ChangeTenantStatusSchema>;
export type AddTenantAddonsInput = z.infer<typeof AddTenantAddonsSchema>;
export type RemoveTenantAddonInput = z.infer<typeof RemoveTenantAddonSchema>;

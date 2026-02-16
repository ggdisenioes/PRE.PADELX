-- Agregar columnas admin_email y phone a tenants (no existían)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS phone TEXT;

-- Setear email admin de Twinco
UPDATE public.tenants
SET admin_email = 'ggdisenioes@gmail.com'
WHERE slug = 'twinco';

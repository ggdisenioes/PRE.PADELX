-- 001_courts.sql
-- Tabla de pistas (Administrador de Pistas)
-- Requiere: tabla profiles con columnas (id uuid, tenant_id uuid, role text, active boolean)

begin;

create table if not exists public.courts (
  id bigserial primary key,
  tenant_id uuid not null,
  name text not null,
  is_covered boolean not null default false,
  created_at timestamptz not null default now()
);

-- Evita nombres duplicados dentro del mismo tenant
create unique index if not exists courts_tenant_name_uniq
  on public.courts (tenant_id, lower(name));

-- Asignación automática de tenant_id en insert
create or replace function public.set_courts_tenant_id()
returns trigger as $$
declare
  v_tenant uuid;
begin
  select p.tenant_id into v_tenant
  from public.profiles p
  where p.id = auth.uid();

  if v_tenant is null then
    raise exception 'tenant_id no asignado para este usuario';
  end if;

  new.tenant_id := v_tenant;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_courts_tenant_id on public.courts;
create trigger trg_set_courts_tenant_id
before insert on public.courts
for each row execute function public.set_courts_tenant_id();

alter table public.courts enable row level security;

-- SELECT: cualquier usuario activo del mismo tenant puede ver las pistas
drop policy if exists "courts_select_same_tenant" on public.courts;
create policy "courts_select_same_tenant"
on public.courts
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.tenant_id = courts.tenant_id
  )
);

-- INSERT: admin/manager activo del mismo tenant
drop policy if exists "courts_insert_admin_manager" on public.courts;
create policy "courts_insert_admin_manager"
on public.courts
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.tenant_id = courts.tenant_id
      and p.role in ('admin','manager')
  )
);

-- UPDATE: admin/manager activo del mismo tenant
drop policy if exists "courts_update_admin_manager" on public.courts;
create policy "courts_update_admin_manager"
on public.courts
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.tenant_id = courts.tenant_id
      and p.role in ('admin','manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.tenant_id = courts.tenant_id
      and p.role in ('admin','manager')
  )
);

commit;

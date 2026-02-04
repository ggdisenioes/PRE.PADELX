-- 003_auto_level.sql
-- Nivel automático (1.0 a 7.0) basado en historial general (incluye TODOS los partidos)
-- Implementación Elo simplificada para 2vs2.
--
-- Requiere:
--  - public.players(id bigint, level numeric nullable)
--  - public.matches(id bigint, winner text, score text, player_1_a bigint, player_2_a bigint, player_1_b bigint, player_2_b bigint)
--  - winner: 'A' | 'B' | 'pending'
--
-- NOTA: recalcula SOLO cuando winner pasa a A/B.

begin;

create or replace function public.clamp_level(n numeric)
returns numeric as $$
begin
  if n is null then
    return 4.0;
  end if;
  if n < 1.0 then return 1.0; end if;
  if n > 7.0 then return 7.0; end if;
  return n;
end;
$$ language plpgsql immutable;

create or replace function public.apply_elo_to_players(
  p_win_team text,
  a1 bigint,
  a2 bigint,
  b1 bigint,
  b2 bigint
)
returns void as $$
declare
  k numeric := 0.15; -- sensibilidad (más alto = más rápido cambia)
  la1 numeric; la2 numeric; lb1 numeric; lb2 numeric;
  ra numeric; rb numeric;
  ea numeric; eb numeric;
  sa numeric; sb numeric;
  da numeric; db numeric;
begin
  if p_win_team not in ('A','B') then
    return;
  end if;

  -- levels actuales (default 4.0)
  select public.clamp_level(level) into la1 from public.players where id = a1;
  select public.clamp_level(level) into la2 from public.players where id = a2;
  select public.clamp_level(level) into lb1 from public.players where id = b1;
  select public.clamp_level(level) into lb2 from public.players where id = b2;

  ra := (coalesce(la1,4.0) + coalesce(la2,4.0)) / 2.0;
  rb := (coalesce(lb1,4.0) + coalesce(lb2,4.0)) / 2.0;

  -- expectativa (Elo)
  ea := 1.0 / (1.0 + power(10.0, (rb - ra) / 2.0));
  eb := 1.0 - ea;

  sa := case when p_win_team = 'A' then 1.0 else 0.0 end;
  sb := 1.0 - sa;

  da := k * (sa - ea);
  db := k * (sb - eb);

  -- distribuir cambio a los jugadores (mismo delta para ambos del equipo)
  update public.players set level = public.clamp_level(coalesce(level,4.0) + da)
    where id in (a1,a2);

  update public.players set level = public.clamp_level(coalesce(level,4.0) + db)
    where id in (b1,b2);
end;
$$ language plpgsql security definer;

-- Trigger: aplica ELO cuando el partido queda finalizado (winner A/B)
create or replace function public.trg_matches_apply_elo()
returns trigger as $$
begin
  -- Solo cuando pasa a finalizado
  if new.winner in ('A','B') and (old.winner is distinct from new.winner) then
    -- Solo si están los 4 jugadores
    if new.player_1_a is null or new.player_2_a is null or new.player_1_b is null or new.player_2_b is null then
      return new;
    end if;

    perform public.apply_elo_to_players(new.winner, new.player_1_a, new.player_2_a, new.player_1_b, new.player_2_b);
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_matches_apply_elo on public.matches;
create trigger trg_matches_apply_elo
after update of winner on public.matches
for each row execute function public.trg_matches_apply_elo();

commit;

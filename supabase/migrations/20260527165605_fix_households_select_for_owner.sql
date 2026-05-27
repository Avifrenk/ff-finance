-- =============================================================================
-- Fix: SELECT-policy на households должна пускать owner'а даже до того, как
-- он формально добавлен в household_members.
--
-- Контекст. `supabase-js` всегда добавляет RETURNING к INSERT (например при
-- `.insert(...).select('id').single()`), а Postgres требует, чтобы RETURNED
-- row проходил SELECT-policy. В момент создания household юзер ещё не записан
-- в household_members → current_household_id() вернёт NULL → SELECT падает
-- → весь INSERT откатывается с "new row violates row-level security policy".
--
-- Чиним расширением policy: владелец строки видит её в любом случае.
-- =============================================================================

drop policy if exists "households: members can read" on public.households;

create policy "households: members or owner can read"
  on public.households
  for select
  to authenticated
  using (
    id = public.current_household_id()
    or owner_id = auth.uid()
  );

-- =============================================================================
-- Migration: household_invites (Фаза 1.4)
-- =============================================================================
-- Приглашения супруги/партнёра в household.
--
-- На MVP писем мы не шлём — owner получает ссылку /invite/<token> и сам
-- передаёт её партнёру (мессенджером). Реальную рассылку через Supabase
-- Email отложили до Фазы 8 (полировка).
--
-- Поток:
--   1. Owner вызывает INSERT в household_invites (RLS пропустит).
--   2. Получает token, формирует URL `<app>/invite/<token>`, шлёт супруге.
--   3. Супруга открывает URL, авторизуется (если ещё нет), вызывает RPC
--      accept_invite(token) — функция SECURITY DEFINER:
--        - проверяет token, expires_at, accepted_at;
--        - INSERT в household_members(role='partner');
--        - помечает invite accepted_at = now().
--   4. Уникальный индекс на household_members.profile_id защищает от
--      «уже состоит в другой семье».
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. household_invites
-- -----------------------------------------------------------------------------
create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email        text,                                  -- кого приглашаем (не enforced — для UI)
  token        text not null unique default gen_random_uuid()::text,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index household_invites_household_id_idx on public.household_invites(household_id);
create index household_invites_token_idx        on public.household_invites(token);

comment on table  public.household_invites is 'Приглашения в household. Owner создаёт, партнёр принимает через RPC accept_invite.';
comment on column public.household_invites.email is 'Кого приглашаем — для UI, не enforced (любой авторизованный с токеном примет).';
comment on column public.household_invites.token is 'URL-safe токен (uuid v4). Используется в /invite/<token>.';


-- -----------------------------------------------------------------------------
-- 2. RLS на household_invites
-- -----------------------------------------------------------------------------
alter table public.household_invites enable row level security;

-- SELECT — только owner целевого household видит свои приглашения.
-- Принимающий партнёр НЕ читает invites напрямую — он шлёт token в RPC.
create policy "household_invites: owner reads own"
  on public.household_invites
  for select
  to authenticated
  using (
    household_id in (
      select id from public.households where owner_id = auth.uid()
    )
  );

-- INSERT — только owner.
create policy "household_invites: owner creates"
  on public.household_invites
  for insert
  to authenticated
  with check (
    household_id in (
      select id from public.households where owner_id = auth.uid()
    )
  );

-- DELETE — owner (отзыв приглашения).
create policy "household_invites: owner deletes"
  on public.household_invites
  for delete
  to authenticated
  using (
    household_id in (
      select id from public.households where owner_id = auth.uid()
    )
  );

-- UPDATE — не нужен через клиента. accept_invite RPC помечает accepted_at
-- сам, под security definer. Политику намеренно не создаём.


-- -----------------------------------------------------------------------------
-- 3. RPC: accept_invite
-- -----------------------------------------------------------------------------
-- Атомарное принятие приглашения.
-- Возвращает household_id, в который пользователь попал.
-- Бросает осмысленные ошибки для UI.
create or replace function public.accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite        public.household_invites%rowtype;
  v_user_id       uuid := auth.uid();
  v_already_in    uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Берём invite с блокировкой строки, чтобы два одновременных принятия
  -- не прошли оба.
  select * into v_invite
  from   public.household_invites
  where  token = invite_token
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'INVITE_ALREADY_ACCEPTED' using errcode = '23505';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'INVITE_EXPIRED' using errcode = '22008';
  end if;

  -- Проверка «уже в какой-то семье» — нужна заранее, чтобы вернуть понятную
  -- ошибку (вместо unique_violation на индексе).
  select household_id into v_already_in
  from   public.household_members
  where  profile_id = v_user_id;

  if v_already_in is not null then
    if v_already_in = v_invite.household_id then
      -- Идемпотентно: пользователь уже в этой же семье — просто помечаем
      -- invite принятым и возвращаем.
      update public.household_invites
        set accepted_at = now()
        where id = v_invite.id;
      return v_invite.household_id;
    else
      raise exception 'ALREADY_IN_ANOTHER_HOUSEHOLD' using errcode = '23505';
    end if;
  end if;

  insert into public.household_members (household_id, profile_id, role)
  values (v_invite.household_id, v_user_id, 'partner');

  update public.household_invites
    set accepted_at = now()
    where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

comment on function public.accept_invite is
  'Принимает приглашение по токену. Возвращает household_id. Возможные ошибки: INVITE_NOT_FOUND, INVITE_ALREADY_ACCEPTED, INVITE_EXPIRED, ALREADY_IN_ANOTHER_HOUSEHOLD, AUTH_REQUIRED.';

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

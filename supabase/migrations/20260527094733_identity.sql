-- =============================================================================
-- Migration: identity (Фаза 1.2 + 1.3)
-- =============================================================================
-- Ядро identity для семейного финтрекера:
--   * profiles        — расширение auth.users для UI-полей (имя, аватар, locale)
--   * households      — «семья» (на MVP — пара; технически 2+)
--   * household_members — членство профиля в семье с ролью owner/partner
--
-- Инварианты:
--   * RLS включается одновременно с созданием таблицы (правило проекта).
--   * Один профиль может состоять максимум в одной household (MVP-пара).
--     Если в будущем появится потребность в «расширенной семье» — снимать
--     уникальный индекс и переделывать политики.
--   * Триггер on_auth_user_created автоматически создаёт строку в profiles
--     при регистрации в Supabase Auth.
--
-- Двухуровневая модель приватности (visibility у счёта, is_private у операции)
-- из памяти проекта — будет добавлена в Фазе 2 вместе с таблицами accounts
-- и operations. Здесь только инфраструктура identity.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  locale       text not null default 'ru',
  created_at   timestamptz not null default now()
);

comment on table  public.profiles is 'UI-расширение auth.users: имя, аватар, локаль.';
comment on column public.profiles.id is 'Совпадает с auth.users.id (1:1).';


-- -----------------------------------------------------------------------------
-- 2. households
-- -----------------------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index households_owner_id_idx on public.households(owner_id);

comment on table  public.households is 'Семья. Один профиль = одна household (MVP).';
comment on column public.households.owner_id is 'Создатель семьи. Не удаляется каскадом — сначала надо передать ownership или расформировать.';


-- -----------------------------------------------------------------------------
-- 3. household_members
-- -----------------------------------------------------------------------------
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id)   on delete cascade,
  role         text not null check (role in ('owner', 'partner')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, profile_id)
);

-- MVP-инвариант: один профиль = максимум одна household.
create unique index household_members_profile_id_unique
  on public.household_members(profile_id);

create index household_members_household_id_idx
  on public.household_members(household_id);

comment on table public.household_members is 'Членство профиля в семье. role: owner (создатель) / partner (приглашённый).';


-- -----------------------------------------------------------------------------
-- 4. Helper: SECURITY DEFINER-функция для разрыва RLS-рекурсии
-- -----------------------------------------------------------------------------
-- Чтобы политики на households и profiles могли спросить «в какой household
-- состоит текущий пользователь», нужно прочитать household_members без RLS
-- (иначе получим бесконечную рекурсию). Стандартный приём — SECURITY DEFINER
-- функция, владельцем которой является postgres.
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from   public.household_members
  where  profile_id = auth.uid()
  limit  1;
$$;

comment on function public.current_household_id is 'Возвращает household_id текущего auth.uid() в обход RLS. Используется внутри политик.';

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated;


-- -----------------------------------------------------------------------------
-- 5. Триггер: автоматическое создание profile при регистрации в auth.users
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- RLS — Фаза 1.3
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;


-- -----------------------------------------------------------------------------
-- RLS: profiles
-- -----------------------------------------------------------------------------
-- SELECT — свой профиль всегда; чужие профили — только если мы в одной household.
create policy "profiles: self or same household can read"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or id in (
      select profile_id
      from   public.household_members
      where  household_id = public.current_household_id()
    )
  );

-- UPDATE — только свой профиль.
create policy "profiles: only self can update"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT — не нужен через RLS, так как профили создаются триггером
-- on_auth_user_created (SECURITY DEFINER). Если кто-то попробует напрямую
-- — пусть упадёт. Политику не добавляем намеренно.


-- -----------------------------------------------------------------------------
-- RLS: households
-- -----------------------------------------------------------------------------
-- SELECT — только если ты участник этого household.
create policy "households: members can read"
  on public.households
  for select
  to authenticated
  using (id = public.current_household_id());

-- INSERT — любой авторизованный может создать свою семью; owner_id обязан быть
-- auth.uid(). Уникальный индекс household_members.profile_id гарантирует,
-- что один профиль не сможет одновременно быть в двух семьях.
create policy "households: authenticated can create own"
  on public.households
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- UPDATE — только owner.
create policy "households: only owner can update"
  on public.households
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- DELETE — только owner.
create policy "households: only owner can delete"
  on public.households
  for delete
  to authenticated
  using (owner_id = auth.uid());


-- -----------------------------------------------------------------------------
-- RLS: household_members
-- -----------------------------------------------------------------------------
-- SELECT — членам того же household.
create policy "household_members: members of same household can read"
  on public.household_members
  for select
  to authenticated
  using (household_id = public.current_household_id());

-- INSERT — два кейса:
--   (a) owner добавляет partner в свою household;
--   (b) самый первый INSERT — owner добавляет себя сразу после создания
--       household (auth.uid() = profile_id = owner новой household).
-- Оба сводятся к: «household.owner_id = auth.uid() ИЛИ profile_id = auth.uid()».
create policy "household_members: owner adds, or self joins"
  on public.household_members
  for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    or household_id in (
      select id from public.households where owner_id = auth.uid()
    )
  );

-- DELETE — owner кикает кого угодно (включая себя — расформирование),
-- partner может выйти сам.
create policy "household_members: owner kicks or self leaves"
  on public.household_members
  for delete
  to authenticated
  using (
    profile_id = auth.uid()
    or household_id in (
      select id from public.households where owner_id = auth.uid()
    )
  );

-- UPDATE — на MVP не нужен (роли не меняются). Политика не создаётся,
-- любой UPDATE будет отклонён.

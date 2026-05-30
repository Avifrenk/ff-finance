-- =============================================================================
-- Migration: goals + goal_contributions (Фаза 4.1)
-- =============================================================================
-- Совместные и личные накопительные цели семьи. Каждая цель — это плоская
-- сущность с target_amount, прогресс считается отдельной таблицей
-- goal_contributions (один contribution = одно пополнение).
--
-- Почему отдельная таблица, а не operations.goal_id:
--   * пополнения не должны попадать в pie/bar/budgets Фазы 3 — иначе ложные
--     «расходы по категории Цели» начнут портить аналитику;
--   * concept-разница: contribution ≠ трата, это движение в накопительный план;
--   * в Фазе 5 (крипта) и Фазе 7 (долги) появятся свои источники contributions,
--     и держать их через operations.goal_id уже не получится.
--
-- Двухуровневая приватность:
--   * visibility='personal' — цель видна только owner_profile_id;
--   * visibility='shared'   — цель видна обоим членам household;
--   * auto-зачисление никогда не «протаскивает» деньги между уровнями (см.
--     Фазу 4.5, apply_auto_goal_contributions).
--
-- Все суммы хранятся в households.base_currency. Поле currency не делаем —
-- та же логика, что у budgets (Фаза 3.4).
--
-- Инварианты:
--   * RLS включается одновременно с CREATE TABLE.
--   * GRANTы для authenticated явные.
--   * service_role не используется — apply_auto_goal_contributions() в Фазе 4.5
--     будет security definer.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. goals
-- -----------------------------------------------------------------------------
create table public.goals (
  id                       uuid primary key default gen_random_uuid(),
  household_id             uuid not null references public.households(id) on delete cascade,
  owner_profile_id         uuid not null references public.profiles(id)   on delete restrict,
  name                     text not null,
  target_amount            numeric(14, 2) not null check (target_amount > 0),
  target_date              date,
  visibility               text not null default 'shared'
                                check (visibility in ('personal', 'shared')),
  auto_percent_of_income   numeric(5, 2) not null default 0
                                check (auto_percent_of_income >= 0
                                       and auto_percent_of_income <= 100),
  icon                     text,
  color                    text,
  is_archived              boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index goals_household_archived_idx
  on public.goals(household_id, is_archived);

create index goals_household_visibility_idx
  on public.goals(household_id, visibility);

comment on table  public.goals is 'Накопительные цели семьи. target_amount хранится в households.base_currency. visibility — двухуровневая приватность как у accounts.';
comment on column public.goals.owner_profile_id is 'Автор цели. Для personal — единственный, кто её видит; для shared — изначальный создатель (партнёр тоже может редактировать).';
comment on column public.goals.auto_percent_of_income is 'Процент с каждой income-операции, автоматически зачисляемый в эту цель (0..100). 0 — авто-зачисление выключено.';
comment on column public.goals.is_archived is 'Достигнутые/неактуальные цели скрываются, но не удаляются — история contributions важна.';


-- -----------------------------------------------------------------------------
-- 2. goal_contributions
-- -----------------------------------------------------------------------------
create table public.goal_contributions (
  id                  uuid primary key default gen_random_uuid(),
  goal_id             uuid not null references public.goals(id) on delete cascade,
  amount              numeric(14, 2) not null check (amount > 0),
  occurred_at         date not null default current_date,
  author_profile_id   uuid not null references public.profiles(id) on delete restrict,
  source              text not null default 'manual'
                            check (source in ('manual', 'auto')),
  source_operation_id uuid references public.operations(id) on delete set null,
  note                text,
  created_at          timestamptz not null default now()
);

create index goal_contributions_goal_idx
  on public.goal_contributions(goal_id, occurred_at desc);

-- Идемпотентность auto-зачисления: при повторном tick_schedules одна и та же
-- income-операция не должна создать contribution дважды. Partial unique
-- индекс — только для auto-записей с привязкой к операции.
create unique index goal_contributions_auto_unique
  on public.goal_contributions(goal_id, source_operation_id)
  where source_operation_id is not null;

comment on table  public.goal_contributions is 'Лог пополнений цели. Сумма в households.base_currency.';
comment on column public.goal_contributions.source is 'manual — пользователь нажал «Пополнить»; auto — apply_auto_goal_contributions() при income-операции.';
comment on column public.goal_contributions.source_operation_id is 'Для source=auto — из какой income-операции порождён. on delete set null: удаление операции не откатывает уже «отложенные» деньги.';


-- =============================================================================
-- 3. updated_at trigger для goals
-- =============================================================================
-- Минимальная реализация — для goal_contributions не нужно, они immutable
-- (правка contribution — это «удалить + создать новый», UI так и делает).
create or replace function public.goals_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger goals_touch_updated_at
  before update on public.goals
  for each row execute function public.goals_touch_updated_at();


-- =============================================================================
-- 4. RLS — goals
-- =============================================================================
alter table public.goals enable row level security;

-- SELECT: член household. Если visibility='personal' — только owner.
create policy "goals: visible to members"
  on public.goals
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );

-- INSERT: член household, owner_profile_id = я.
create policy "goals: members insert as themselves"
  on public.goals
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and owner_profile_id = auth.uid()
  );

-- UPDATE: shared — любой партнёр; personal — только автор.
create policy "goals: shared editable by members, personal by owner"
  on public.goals
  for update
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  )
  with check (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );

-- DELETE: тот же предикат.
create policy "goals: shared deletable by members, personal by owner"
  on public.goals
  for delete
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );


-- =============================================================================
-- 5. RLS — goal_contributions
-- =============================================================================
alter table public.goal_contributions enable row level security;

-- SELECT: цель видна текущему пользователю.
create policy "goal_contributions: visible if goal is visible"
  on public.goal_contributions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_contributions.goal_id
        and g.household_id = public.current_household_id()
        and (g.visibility = 'shared' or g.owner_profile_id = auth.uid())
    )
  );

-- INSERT: цель видна И автор = я.
create policy "goal_contributions: author inserts on visible goal"
  on public.goal_contributions
  for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and exists (
      select 1 from public.goals g
      where g.id = goal_id
        and g.household_id = public.current_household_id()
        and (g.visibility = 'shared' or g.owner_profile_id = auth.uid())
    )
  );

-- UPDATE: только автор contribution.
create policy "goal_contributions: only author updates"
  on public.goal_contributions
  for update
  to authenticated
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

-- DELETE: автор contribution ИЛИ автор цели (на случай чужого ошибочного
-- пополнения shared-цели).
create policy "goal_contributions: author or goal owner deletes"
  on public.goal_contributions
  for delete
  to authenticated
  using (
    author_profile_id = auth.uid()
    or exists (
      select 1 from public.goals g
      where g.id = goal_contributions.goal_id
        and g.owner_profile_id = auth.uid()
    )
  );


-- =============================================================================
-- 6. GRANTы
-- =============================================================================
grant select, insert, update, delete on public.goals               to authenticated;
grant select, insert, update, delete on public.goal_contributions  to authenticated;

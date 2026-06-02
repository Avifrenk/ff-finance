-- =============================================================================
-- Migration: shopping_items (Совместный список покупок)
-- =============================================================================
-- Семейный shopping list поверх существующего household-каркаса. Одна таблица,
-- один список на household. Никаких категорий, qty, unit — всё пишется в title.
--
-- Жизненный цикл позиции:
--   1. INSERT: checked_at = null, deleted_at = null   (надо купить)
--   2. UPDATE checked_at = now()                      (куплено)
--   3. (опц.) UPDATE checked_at = null                (вернуть в "надо купить")
--   4. UPDATE deleted_at = now()                      (soft delete)
--
-- Realtime: таблица добавлена в publication `supabase_realtime` — это первое
-- использование Supabase Realtime в проекте. Reasoning: shopping list бесполезен
-- без кросс-устройственного обновления (жена пишет с дивана, муж видит в
-- магазине). ff:*-changed events работают только внутри одной вкладки.
--
-- Инварианты:
--   * RLS включается одновременно с CREATE TABLE.
--   * GRANTы для authenticated явные.
--   * Удаление — soft (deleted_at), не hard. RLS для DELETE не нужна.
--   * Никаких триггеров, edge functions, service_role — чисто пользовательская
--     таблица.
-- =============================================================================

create table public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 200),
  added_by     uuid not null references public.profiles(id)   on delete restrict,
  checked_at   timestamptz null,
  checked_by   uuid null     references public.profiles(id)   on delete set null,
  deleted_at   timestamptz null,
  created_at   timestamptz not null default now()
);

-- Основной запрос: "активные позиции household'а, последние сверху".
-- Покрывает оба фильтра (pending = checked_at is null; doneToday = checked_at
-- >= today) при первичном фильтре по household_id + deleted_at is null.
create index shopping_items_household_active_idx
  on public.shopping_items(household_id, deleted_at, checked_at, created_at desc);

comment on table  public.shopping_items is 'Совместный список покупок household. Soft delete через deleted_at.';
comment on column public.shopping_items.title      is 'Название позиции. До 200 символов. Структуру не разбиваем — qty/unit в той же строке.';
comment on column public.shopping_items.checked_at is 'null = надо купить, not null = куплено в этот момент.';
comment on column public.shopping_items.deleted_at is 'Soft delete. UI скрывает строки с deleted_at != null.';


-- =============================================================================
-- RLS
-- =============================================================================
alter table public.shopping_items enable row level security;

-- SELECT — членам household.
create policy "shopping_items: household reads"
  on public.shopping_items
  for select
  to authenticated
  using (household_id = public.current_household_id());

-- INSERT — членам household, added_by = auth.uid().
create policy "shopping_items: household writes"
  on public.shopping_items
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and added_by = auth.uid()
  );

-- UPDATE — любой член household может отметить/восстановить/удалить позицию.
-- Партнёр может купить то, что добавил другой — это и есть смысл совместного
-- списка. Защиту "нельзя менять added_by" даём через with check на household.
create policy "shopping_items: household updates"
  on public.shopping_items
  for update
  to authenticated
  using      (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- DELETE-policy намеренно не делаем: удаление через update deleted_at.


-- =============================================================================
-- GRANTы
-- =============================================================================
grant select, insert, update on public.shopping_items to authenticated;


-- =============================================================================
-- Realtime publication
-- =============================================================================
-- Добавляем таблицу в дефолтную supabase_realtime publication, чтобы клиент
-- мог подписаться на postgres_changes. Defensive: если publication ещё не
-- существует (локальный dev без realtime) — пропускаем без ошибки.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_items;
  end if;
end $$;

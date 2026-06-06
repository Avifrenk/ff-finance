-- =============================================================================
-- Migration: categories.parent_id + новый список дефолтных категорий
-- =============================================================================
-- Что меняется:
--   1. categories получают опциональный parent_id (self-reference) для двух-
--      уровневой иерархии «🏠 Жильё → 🔑 Аренда / 📋 Арнона / 💡 Коммуналка».
--      Глубина — ровно 2 уровня, проверяется триггером.
--   2. seed_default_categories переписан под реальный список Ави (его план
--      бюджета на 15500₪/мес: 14 строк трат). Новый набор полностью заменяет
--      старый IL-список.
--   3. Backfill для существующих household: удаляются старые дефолтные
--      категории, на которых НЕТ операций и НЕТ бюджетов (то есть никто не
--      потеряет историю). Затем разворачивается новый набор.
--   4. on delete cascade на parent_id — удалил родителя, ушли и дети.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. parent_id колонка + ограничения целостности
-- -----------------------------------------------------------------------------
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade;

create index if not exists categories_household_parent_idx
  on public.categories(household_id, parent_id);

alter table public.categories
  drop constraint if exists categories_parent_not_self;
alter table public.categories
  add constraint categories_parent_not_self
  check (parent_id is null or parent_id <> id);

comment on column public.categories.parent_id is
  'Self-reference. Если задан — категория-лист под родителем того же household и kind. Глубина строго 2 уровня (триггер). ON DELETE CASCADE: удалили родителя — ушли и дети.';


-- -----------------------------------------------------------------------------
-- 2. Триггер: parent того же household, того же kind, сам не лист
-- -----------------------------------------------------------------------------
create or replace function public.categories_validate_parent()
returns trigger
language plpgsql
as $$
declare
  parent_household uuid;
  parent_kind      text;
  parent_parent    uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select household_id, kind, parent_id
    into parent_household, parent_kind, parent_parent
    from public.categories
   where id = new.parent_id;

  if parent_household is null then
    raise exception 'parent_id % не существует', new.parent_id;
  end if;
  if parent_household <> new.household_id then
    raise exception 'parent должен быть в той же household';
  end if;
  if parent_kind <> new.kind then
    raise exception 'parent должен быть того же kind (% vs %)', parent_kind, new.kind;
  end if;
  if parent_parent is not null then
    raise exception 'нельзя вложить подкатегорию в подкатегорию — глубина 2 уровня';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_validate_parent_trg on public.categories;
create trigger categories_validate_parent_trg
  before insert or update of parent_id, household_id, kind on public.categories
  for each row execute function public.categories_validate_parent();


-- -----------------------------------------------------------------------------
-- 3. Новый seed_default_categories
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_categories(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  housing_id     uuid;
  transport_id   uuid;
  insurance_id   uuid;
begin
  -- ------------ EXPENSE: parent-категории --------------------------------
  insert into public.categories (household_id, name, kind, icon, is_default)
  values (target_household_id, 'Жильё', 'expense', '🏠', true)
  on conflict (household_id, lower(name), kind) do update set is_default = excluded.is_default
  returning id into housing_id;

  insert into public.categories (household_id, name, kind, icon, is_default)
  values (target_household_id, 'Транспорт', 'expense', '🚗', true)
  on conflict (household_id, lower(name), kind) do update set is_default = excluded.is_default
  returning id into transport_id;

  insert into public.categories (household_id, name, kind, icon, is_default)
  values (target_household_id, 'Страховки', 'expense', '🛡️', true)
  on conflict (household_id, lower(name), kind) do update set is_default = excluded.is_default
  returning id into insurance_id;

  -- ------------ EXPENSE: плоские категории Ави ---------------------------
  insert into public.categories (household_id, name, kind, icon, is_default) values
    (target_household_id, 'Свадьба',           'expense', '💍', true),
    (target_household_id, 'Инвестиции',        'expense', '📈', true),
    (target_household_id, 'Благотворительность','expense', '🙏', true),
    (target_household_id, 'Фонд подарков',     'expense', '🎁', true),
    (target_household_id, 'Путешествия',       'expense', '✈️', true),
    (target_household_id, 'Собака',            'expense', '🐕', true),
    (target_household_id, 'На себя',           'expense', '💝', true),
    (target_household_id, 'Налоги',            'expense', '💸', true)
  on conflict (household_id, lower(name), kind) do nothing;

  -- ------------ EXPENSE: подкатегории под Жильё --------------------------
  insert into public.categories (household_id, name, kind, icon, is_default, parent_id) values
    (target_household_id, 'Аренда квартиры', 'expense', '🔑', true, housing_id),
    (target_household_id, 'Арнона / ваад',   'expense', '📋', true, housing_id),
    (target_household_id, 'Коммуналка',      'expense', '💡', true, housing_id)
  on conflict (household_id, lower(name), kind) do nothing;

  -- ------------ EXPENSE: подкатегории под Транспорт ----------------------
  insert into public.categories (household_id, name, kind, icon, is_default, parent_id) values
    (target_household_id, 'Авто',   'expense', '🛠️', true, transport_id),
    (target_household_id, 'Бензин', 'expense', '⛽', true, transport_id)
  on conflict (household_id, lower(name), kind) do nothing;

  -- ------------ EXPENSE: подкатегории под Страховки ----------------------
  insert into public.categories (household_id, name, kind, icon, is_default, parent_id) values
    (target_household_id, 'Страховка авто', 'expense', '🚗', true, insurance_id)
  on conflict (household_id, lower(name), kind) do nothing;

  -- ------------ INCOME: оставляем как было -------------------------------
  insert into public.categories (household_id, name, kind, icon, is_default) values
    (target_household_id, 'Зарплата',           'income',  '💼', true),
    (target_household_id, 'Фриланс / Бонус',    'income',  '💰', true),
    (target_household_id, 'Подарки и возвраты', 'income',  '🎁', true),
    (target_household_id, 'Прочее',             'income',  '🔹', true)
  on conflict (household_id, lower(name), kind) do nothing;
end;
$$;

comment on function public.seed_default_categories is
  'Создаёт дефолтный набор категорий под реальный бюджет Ави (15500₪/мес, 14 позиций). Иерархия: Жильё/Транспорт/Страховки — parents с подкатегориями. Идемпотентна.';


-- -----------------------------------------------------------------------------
-- 4. Backfill: для существующих household
-- -----------------------------------------------------------------------------
-- Удаляем старые is_default expense-категории, на которых НЕТ операций и НЕТ
-- бюджетов. Дальше зовём новую seed — она довезёт недостающее.
do $$
declare
  h_id uuid;
begin
  -- 4.1 безопасное удаление старых дефолтных категорий, которые больше не
  -- актуальны (они либо отсутствуют в новом списке, либо переименованы)
  delete from public.categories c
   where c.is_default = true
     and c.kind = 'expense'
     and c.parent_id is null
     and c.name in (
       'Продукты',
       'Кафе и рестораны',
       'Транспорт',           -- старая плоская, заменяется на parent с детьми
       'Жильё (арнона, ваад)',-- старое имя, заменяется на «Жильё» с детьми
       'Коммуналка',          -- старая плоская, теперь под «Жильё»
       'Купат-холим',
       'Связь и интернет',
       'Одежда',
       'Развлечения',
       'Здоровье',
       'Образование',
       'Подарки',             -- старое имя, в новом списке «Фонд подарков»
       'Прочее'
     )
     and not exists (select 1 from public.operations o where o.category_id = c.id)
     and not exists (select 1 from public.budgets   b where b.category_id = c.id);

  -- 4.2 разворачиваем новый набор у каждого household
  for h_id in select id from public.households loop
    perform public.seed_default_categories(h_id);
  end loop;
end;
$$;

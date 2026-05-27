-- =============================================================================
-- Migration: seed_default_categories (Фаза 2.3)
-- =============================================================================
-- При создании household автоматически разворачиваем дефолтный набор
-- категорий под Израиль. Их можно потом редактировать / удалять — это
-- не системные строки, флаг is_default только для UI-подсказки.
-- =============================================================================

create or replace function public.seed_default_categories(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, kind, icon, is_default) values
    (target_household_id, 'Продукты',              'expense', '🛒', true),
    (target_household_id, 'Кафе и рестораны',      'expense', '🍽️', true),
    (target_household_id, 'Транспорт',             'expense', '🚌', true),
    (target_household_id, 'Жильё (арнона, ваад)',  'expense', '🏠', true),
    (target_household_id, 'Коммуналка',            'expense', '💡', true),
    (target_household_id, 'Купат-холим',           'expense', '🏥', true),
    (target_household_id, 'Связь и интернет',      'expense', '📱', true),
    (target_household_id, 'Одежда',                'expense', '👕', true),
    (target_household_id, 'Развлечения',           'expense', '🎬', true),
    (target_household_id, 'Здоровье',              'expense', '💊', true),
    (target_household_id, 'Образование',           'expense', '📚', true),
    (target_household_id, 'Подарки',               'expense', '🎁', true),
    (target_household_id, 'Путешествия',           'expense', '✈️', true),
    (target_household_id, 'Прочее',                'expense', '🔸', true),
    (target_household_id, 'Зарплата',              'income',  '💼', true),
    (target_household_id, 'Фриланс / Бонус',       'income',  '💰', true),
    (target_household_id, 'Подарки и возвраты',    'income',  '🎁', true),
    (target_household_id, 'Прочее',                'income',  '🔹', true)
  on conflict do nothing;
end;
$$;

comment on function public.seed_default_categories is
  'Создаёт дефолтный набор категорий под Израиль для указанной household. Идемпотентна: повторный вызов ничего не сломает.';

revoke all on function public.seed_default_categories(uuid) from public;
-- Категории заводит триггер от имени постгреса; клиенту вызывать не нужно.
-- Но на всякий случай разрешим authenticated — UI может предложить «сбросить
-- категории к дефолтным».
grant execute on function public.seed_default_categories(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Триггер: при создании household — сразу разворачиваем дефолтные категории
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

drop trigger if exists on_household_created on public.households;
create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();

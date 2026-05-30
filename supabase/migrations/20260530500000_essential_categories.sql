-- =============================================================================
-- Migration: is_essential на categories (backlog из плана Фазы 4)
-- =============================================================================
-- Подушка безопасности по умолчанию считает по СРЕДНЕМУ расходу — это
-- завышенная цифра, потому что в неё попадают рестораны, развлечения,
-- одежда. «Жизнь без дохода» точнее считать по ОБЯЗАТЕЛЬНЫМ тратам
-- (аренда, ваад, ваад-байт, ваад-байт, купат-холим, еда).
--
-- Фича: на categories добавляем флаг is_essential. Если в семье есть
-- хотя бы одна категория с is_essential=true — SafetyCushion считает
-- по ним. Иначе fallback на все траты (как сейчас).
-- =============================================================================

alter table public.categories
  add column is_essential boolean not null default false;

comment on column public.categories.is_essential is 'Обязательная категория для расчёта подушки безопасности. Если в семье есть хотя бы одна essential, SafetyCushion считает по ним.';

-- Индекс для быстрой проверки «есть ли хоть одна essential» (sparse).
create index categories_essential_idx
  on public.categories (household_id)
  where is_essential = true;

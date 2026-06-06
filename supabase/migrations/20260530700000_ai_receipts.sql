-- =============================================================================
-- Migration: ai_receipts (Фаза 6.1)
-- =============================================================================
-- AI-парсинг фото чеков через Claude Vision.
--
-- Storage:
--   bucket 'receipts' (private), путь {auth.uid()}/{scan_id}.{ext}
--   RLS: только owner может загружать/читать/удалять свою папку.
--
-- Таблица:
--   ai_receipt_scans — история сканов, привязка к household,
--   сырой ответ Claude (parsed_json), линк на созданную operation,
--   учёт токенов и стоимости.
--
-- Инварианты:
--   * status: pending → parsed/failed → applied
--   * applied_operation_id ставится когда юзер подтвердил парсинг
--     и из него создалась операция
--   * Edge Function ai-parse-receipt пишет под service_role (UPDATE),
--     юзер видит только свои строки (RLS)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Storage bucket receipts
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 2. RLS на storage.objects для bucket receipts
-- -----------------------------------------------------------------------------
-- Путь: {auth.uid()}/{scan_id}.{ext}
-- foldername[1] = первый сегмент пути = auth.uid()

drop policy if exists "receipts: owner uploads own" on storage.objects;
create policy "receipts: owner uploads own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts: owner reads own" on storage.objects;
create policy "receipts: owner reads own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts: owner deletes own" on storage.objects;
create policy "receipts: owner deletes own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- service_role читает всё (для Edge Function чтобы скачать фото)
-- (это и так работает, service_role обходит RLS — добавляем для документации)


-- -----------------------------------------------------------------------------
-- 3. Таблица ai_receipt_scans
-- -----------------------------------------------------------------------------
create table public.ai_receipt_scans (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  author_profile_id     uuid not null references public.profiles(id)   on delete restrict,
  storage_path          text not null,
  status                text not null check (status in ('pending', 'parsed', 'failed', 'applied')),
  parsed_json           jsonb,
  applied_operation_id  uuid references public.operations(id) on delete set null,
  tokens_in             int,
  tokens_out            int,
  cost_usd              numeric(10, 4),
  error_message         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index ai_receipt_scans_household_idx
  on public.ai_receipt_scans(household_id, created_at desc);
create index ai_receipt_scans_author_idx
  on public.ai_receipt_scans(author_profile_id, created_at desc);
create index ai_receipt_scans_status_idx
  on public.ai_receipt_scans(status) where status in ('pending', 'failed');

comment on table  public.ai_receipt_scans is 'История парсинга фото чеков через Claude Vision. status: pending → parsed/failed → applied.';
comment on column public.ai_receipt_scans.storage_path is 'Путь в bucket receipts/, формат {auth.uid()}/{scan_id}.{ext}';
comment on column public.ai_receipt_scans.parsed_json is 'Сырой JSON от Claude: {vendor, date, currency, total, items: [...]}';
comment on column public.ai_receipt_scans.applied_operation_id is 'Заполняется когда юзер подтвердил парсинг и из него создалась operation.';
comment on column public.ai_receipt_scans.cost_usd is 'Стоимость вызова Claude API в долларах. Для аналитики и контроля бюджета.';


-- -----------------------------------------------------------------------------
-- 4. updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.ai_receipt_scans_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_receipt_scans_touch_updated_at
  before update on public.ai_receipt_scans
  for each row execute function public.ai_receipt_scans_touch_updated_at();


-- =============================================================================
-- RLS
-- =============================================================================
alter table public.ai_receipt_scans enable row level security;

-- SELECT: автор видит свои сканы
create policy "ai_receipt_scans: author reads own"
  on public.ai_receipt_scans for select
  to authenticated
  using (author_profile_id = auth.uid());

-- INSERT: автор вставляет себя, в свою household
create policy "ai_receipt_scans: author inserts own"
  on public.ai_receipt_scans for insert
  to authenticated
  with check (
    author_profile_id = auth.uid()
    and household_id = public.current_household_id()
  );

-- UPDATE: автор может править свои (например, привязать applied_operation_id
-- после ручного выбора счёта/категории и создания operation на клиенте)
create policy "ai_receipt_scans: author updates own"
  on public.ai_receipt_scans for update
  to authenticated
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

-- DELETE: автор может удалить свой скан
create policy "ai_receipt_scans: author deletes own"
  on public.ai_receipt_scans for delete
  to authenticated
  using (author_profile_id = auth.uid());


-- =============================================================================
-- GRANTы
-- =============================================================================
grant select, insert, update, delete on public.ai_receipt_scans to authenticated;
grant select, insert, update, delete on public.ai_receipt_scans to service_role;

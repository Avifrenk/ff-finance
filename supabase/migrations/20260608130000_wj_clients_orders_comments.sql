-- =============================================================================
-- Migration: карточка клиента + заказы под клиентом + комментарии (задачник v2)
-- =============================================================================
-- План: work-journal/plans/2026-06-08-kartochka-klienta-zakazy-kommentarii.md
--
-- Эволюция модели: раньше «одна wj_records = один заказ», клиент — агрегат по
-- имени+телефону. Теперь явная сущность КЛИЕНТ (wj_clients) — карточка-мастер,
-- внутрь которой вносят И структурированные ЗАКАЗЫ (wj_records + client_id), И
-- свободные КОММЕНТАРИИ (wj_comments). Поля проекта делятся на scope client|order.
--
-- RLS — единый паттерн задачника: видимость НЕ хранится копией, а наследуется от
-- проекта через EXISTS-подзапрос (как wj_records/wj_fields). Комментарии — два
-- уровня (wj_comments → wj_clients → wj_projects); правка/удаление — только автор.
--
-- УРОК bug 20260608120000 (push_subscriptions): для UPDATE обязателен И явный
-- grant update, И UPDATE-RLS-политика — здесь выданы сразу.
--
-- Реальных данных нет (0 записей) — миграция чисто аддитивная, бэкфилла не нужно.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. wj_clients — карточка клиента (мастер)
-- -----------------------------------------------------------------------------
create table public.wj_clients (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.wj_projects(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  values      jsonb not null default '{}'::jsonb,  -- значения client-полей по wj_fields.key
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index wj_clients_project_idx
  on public.wj_clients(project_id, created_at desc);

comment on table public.wj_clients is 'Карточка клиента задачника (мастер). values — значения client-scope полей по wj_fields.key. Под клиентом: заказы (wj_records.client_id) и комментарии (wj_comments). Видимость наследуется от проекта в RLS.';

alter table public.wj_clients enable row level security;

create policy "wj_clients: visible if project visible"
  on public.wj_clients for select
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_clients.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_clients: insert if project visible"
  on public.wj_clients for insert
  with check (
    household_id = public.current_household_id()
    and exists (
      select 1 from public.wj_projects p
      where p.id = wj_clients.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_clients: update if project visible"
  on public.wj_clients for update
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_clients.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_clients.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_clients: delete if project visible"
  on public.wj_clients for delete
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_clients.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create trigger wj_clients_touch_updated_at
  before update on public.wj_clients
  for each row execute function public.wj_touch_updated_at();

grant select, insert, update, delete on public.wj_clients to authenticated;


-- -----------------------------------------------------------------------------
-- 2. wj_fields.scope — поле принадлежит клиенту или заказу
-- -----------------------------------------------------------------------------
-- Существующие 36 полей по умолчанию остаются order-scope (разнос на client —
-- отдельным сидом, Фаза 5). key остаётся уникальным в пределах проекта (общий
-- namespace values), независимо от scope.
alter table public.wj_fields
  add column scope text not null default 'order'
    check (scope in ('client', 'order'));


-- -----------------------------------------------------------------------------
-- 3. wj_records.client_id — заказ принадлежит клиенту (опционально)
-- -----------------------------------------------------------------------------
-- null = разовый заказ/обращение без карточки клиента (legacy-совместимость).
-- on delete cascade: удалили клиента — его заказы уходят вместе с ним.
alter table public.wj_records
  add column client_id uuid references public.wj_clients(id) on delete cascade;

create index wj_records_client_idx
  on public.wj_records(client_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 4. wj_comments — лента комментариев под клиентом
-- -----------------------------------------------------------------------------
create table public.wj_comments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.wj_clients(id) on delete cascade,
  household_id      uuid not null references public.households(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index wj_comments_client_idx
  on public.wj_comments(client_id, created_at);

comment on table public.wj_comments is 'Лента комментариев под карточкой клиента. read/insert — по видимости проекта клиента; update/delete — только автор.';

alter table public.wj_comments enable row level security;

-- read/insert: виден/пишем, если виден проект клиента (двухуровневый exists).
create policy "wj_comments: visible if client project visible"
  on public.wj_comments for select
  using (
    exists (
      select 1 from public.wj_clients c
      join public.wj_projects p on p.id = c.project_id
      where c.id = wj_comments.client_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_comments: insert as author if client project visible"
  on public.wj_comments for insert
  with check (
    author_profile_id = auth.uid()
    and household_id = public.current_household_id()
    and exists (
      select 1 from public.wj_clients c
      join public.wj_projects p on p.id = c.project_id
      where c.id = wj_comments.client_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

-- update/delete: только автор своего комментария.
create policy "wj_comments: author updates own"
  on public.wj_comments for update
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

create policy "wj_comments: author deletes own"
  on public.wj_comments for delete
  using (author_profile_id = auth.uid());

grant select, insert, update, delete on public.wj_comments to authenticated;

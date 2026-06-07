-- =============================================================================
-- Migration: work_journal_core (модуль «Задачник» / work-journal, Фаза 2)
-- =============================================================================
-- Ядро задачника — модуль ВНУТРИ Frenkel Finance (БД общая). Префикс таблиц
-- `wj_` (work-journal), чтобы не путать с финансовыми. Две независимые части:
--   * «Проекты» — wj_projects + конструктор полей wj_fields + записи wj_records;
--   * «Задачи на день» — wj_tasks (опц. привязка к проекту/записи).
--
-- План: plans/2026-06-06-mvp-zadachnik.md (Фаза 1 — решения по модели; Фаза 2 —
-- эта миграция). Паттерны RLS копируются 1:1 с FF:
--   * personal/shared visibility — как accounts/goals (read = household И
--     (shared ИЛИ owner));
--   * наследование visibility через EXISTS-подзапрос к родителю — как
--     goal_contributions (проверяем И household, И personal/shared).
--
-- Инварианты проекта (соблюдены):
--   * RLS включается одновременно с CREATE TABLE (сразу после каждой таблицы).
--   * Все GRANTы для роли authenticated — явные ("Automatically expose new
--     tables" в проекте выключено) — иначе таблицы под RLS, но недоступны вебу.
--   * Хелпер public.current_household_id() (20260527094733_identity.sql) и
--     auth.uid() доступны и используются в политиках.
--
-- ДЕНЕЖНАЯ МОДЕЛЬ (решение Фазы 1, реализация минимальная — БЕЗ доп. колонок):
--   Значения кастомных полей лежат в wj_records.values (jsonb), ключ =
--   wj_fields.key. Форма значения по типу поля:
--     * text/number/phone/link/note → скаляр (text/number);
--     * date                        → ISO-строка "YYYY-MM-DD";
--     * select/status               → key выбранного значения из wj_fields.options;
--     * checklist                   → массив [{ text, done }] (отдельной таблицы нет);
--     * money                       → { amount: number, currency: string }, а для
--       поля с money_direction='expense' — ещё { purpose: string } («на что»):
--       { amount, currency, purpose }. Назначение траты живёт ВНУТРИ значения
--       money-поля, а не отдельной колонкой/полем — так минимально (см. план,
--       «не усложнять сверх плана»). Обязательность purpose у расхода
--       проверяется на уровне приложения (Фаза 6), не в БД: значение jsonb.
--   Битое значение в аналитике (Фаза 7) отбрасывается с флагом, не роняет
--   дашборд (`->>` всегда text → парсить и проверять на клиенте).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. wj_projects — проект (личный или общий)
-- -----------------------------------------------------------------------------
create table public.wj_projects (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  owner_profile_id  uuid not null references public.profiles(id)   on delete restrict,
  visibility        text not null default 'personal'
                          check (visibility in ('personal', 'shared')),
  name              text not null,
  icon              text,
  color             text,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index wj_projects_household_archived_idx
  on public.wj_projects(household_id, is_archived);
create index wj_projects_household_visibility_idx
  on public.wj_projects(household_id, visibility);

comment on table  public.wj_projects is 'Проект задачника. visibility — двухуровневая приватность как у accounts/goals: personal — видит только owner; shared — оба члена household. israel-dress = shared; mazal/repat-* = personal Ави.';
comment on column public.wj_projects.owner_profile_id is 'Создатель проекта. Для personal — единственный, кто видит; жизненным циклом проекта (rename/archive/delete) управляет только owner (см. RLS).';
comment on column public.wj_projects.is_archived is 'Дефолт удаления в UI — архивирование, а не DELETE (каскад тянет поля и записи). Жёсткое удаление — за подтверждением (Фаза 5).';

alter table public.wj_projects enable row level security;

-- SELECT: член household; если personal — только owner.
create policy "wj_projects: visible to members"
  on public.wj_projects
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );

-- INSERT: в свою household, owner_profile_id = я.
create policy "wj_projects: members insert as themselves"
  on public.wj_projects
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and owner_profile_id = auth.uid()
  );

-- UPDATE / DELETE: только owner (даже для shared — жизненным циклом проекта
-- управляет создатель; контент shared-проекта при этом редактируют оба, см.
-- RLS wj_fields / wj_records, наследующие лишь видимость).
create policy "wj_projects: only owner updates"
  on public.wj_projects
  for update
  to authenticated
  using (owner_profile_id = auth.uid())
  with check (owner_profile_id = auth.uid());

create policy "wj_projects: only owner deletes"
  on public.wj_projects
  for delete
  to authenticated
  using (owner_profile_id = auth.uid());


-- -----------------------------------------------------------------------------
-- 2. wj_fields — определения полей проекта (конструктор)
-- -----------------------------------------------------------------------------
create table public.wj_fields (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.wj_projects(id) on delete cascade,
  household_id    uuid not null references public.households(id)  on delete cascade,
  key             text not null,                  -- slug, ключ в wj_records.values
  label           text not null,
  type            text not null check (type in (
                    'text', 'number', 'money', 'date', 'phone',
                    'link', 'select', 'status', 'checklist', 'note')),
  options         jsonb,                          -- select/status: [{key,label,color,order}]; money: {currencies:[...]}
  money_direction text check (money_direction in ('income', 'expense')),
  is_required     boolean not null default false,
  sort_order      integer not null default 0,
  analytics_role  text check (analytics_role in (
                    'amount', 'date_payment', 'date_due', 'status', 'client_name')),
  created_at      timestamptz not null default now(),

  -- money_direction осмыслен только для money-поля.
  constraint wj_fields_money_direction_only_for_money
    check (money_direction is null or type = 'money'),
  -- key уникален в пределах проекта: иначе два поля затрут друг друга в values.
  constraint wj_fields_project_key_unique unique (project_id, key)
);

create index wj_fields_project_sort_idx
  on public.wj_fields(project_id, sort_order);

comment on table  public.wj_fields is 'Поля проекта (конструктор). key — ключ значения в wj_records.values. analytics_role заполняется эвристикой из типа (см. Фаза 1), пользователю про роль не рассказываем.';
comment on column public.wj_fields.options is 'jsonb. Для select/status — массив значений (порядок/цвет). Для money — список допустимых валют (ILS/RUB/USD/EUR, расширяемый). null — опций нет.';
comment on column public.wj_fields.money_direction is 'Для money-поля: income (доход) | expense (расход). У expense значение в записи несёт ещё purpose («на что»). null — не money.';
comment on column public.wj_fields.analytics_role is 'Роль в аналитике (Фаза 7). null — не участвует. Заполняется эвристикой, ручная переразметка спрятана в «Дополнительно».';

alter table public.wj_fields enable row level security;

-- Видимость и право записи НАСЛЕДУЮТСЯ от проекта через EXISTS-подзапрос
-- (образец goal_contributions): проверяем И household, И personal/shared. Поля —
-- структура проекта; контент shared-проекта правят оба члена household, личного —
-- только owner (т.к. только он видит проект). См. план Фаза 2.
create policy "wj_fields: visible if project visible"
  on public.wj_fields
  for select
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_fields.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_fields: insert if project visible"
  on public.wj_fields
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (
      select 1 from public.wj_projects p
      where p.id = project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_fields: update if project visible"
  on public.wj_fields
  for update
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_fields.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_fields.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_fields: delete if project visible"
  on public.wj_fields
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_fields.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 3. wj_records — записи проекта (карточки клиентов/заказов)
-- -----------------------------------------------------------------------------
create table public.wj_records (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.wj_projects(id) on delete cascade,
  household_id uuid not null references public.households(id)  on delete cascade,
  values       jsonb not null default '{}'::jsonb,  -- ключ = wj_fields.key, форма значения см. шапку
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index wj_records_project_created_idx
  on public.wj_records(project_id, created_at desc);

comment on table  public.wj_records is 'Запись проекта = один заказ/обращение (у человека может быть несколько). «Имя клиента» — обычное поле в values, не отдельная таблица. visibility НЕ хранится копией — наследуется от проекта в RLS (нет дыры рассинхрона при смене visibility проекта).';
comment on column public.wj_records.values is 'Значения кастомных полей, ключ = wj_fields.key. money → {amount,currency(,purpose для expense)}; checklist → [{text,done}]; date → ISO; select/status → key значения.';

alter table public.wj_records enable row level security;

-- visibility наследуется от проекта через EXISTS-подзапрос (как wj_fields).
create policy "wj_records: visible if project visible"
  on public.wj_records
  for select
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_records.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_records: insert if project visible"
  on public.wj_records
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and exists (
      select 1 from public.wj_projects p
      where p.id = project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_records: update if project visible"
  on public.wj_records
  for update
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_records.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_records.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );

create policy "wj_records: delete if project visible"
  on public.wj_records
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.wj_projects p
      where p.id = wj_records.project_id
        and p.household_id = public.current_household_id()
        and (p.visibility = 'shared' or p.owner_profile_id = auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 4. wj_tasks — задачи на день
-- -----------------------------------------------------------------------------
create table public.wj_tasks (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  owner_profile_id  uuid not null references public.profiles(id)   on delete restrict,
  visibility        text not null default 'personal'
                          check (visibility in ('personal', 'shared')),
  title             text not null,
  notes             text,
  due_date          date,
  is_done           boolean not null default false,
  done_at           timestamptz,
  reminder_at       timestamptz,
  -- Привязка к проекту/записи опциональна. on delete set null: при удалении
  -- проекта/записи задача становится «сиротой», а не исчезает (план: удаление
  -- проекта не должно молча тянуть за собой задачи).
  project_id        uuid references public.wj_projects(id) on delete set null,
  record_id         uuid references public.wj_records(id)  on delete set null,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index wj_tasks_household_due_idx on public.wj_tasks(household_id, due_date);
create index wj_tasks_reminder_idx      on public.wj_tasks(reminder_at);

comment on table  public.wj_tasks is 'Задача на день. По умолчанию — просто дело; опц. привязка к проекту/записи. visibility personal/shared. reminder_at — для крона напоминаний (Фаза 8, через notification_queue).';
comment on column public.wj_tasks.reminder_at is 'Когда напомнить (timestamptz, nullable). Индекс wj_tasks_reminder_idx — для крон-выборки наступивших напоминаний.';

alter table public.wj_tasks enable row level security;

-- SELECT: член household; если personal — только owner.
create policy "wj_tasks: visible to members"
  on public.wj_tasks
  for select
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );

-- INSERT: в свою household, owner_profile_id = я.
create policy "wj_tasks: members insert as themselves"
  on public.wj_tasks
  for insert
  to authenticated
  with check (
    household_id = public.current_household_id()
    and owner_profile_id = auth.uid()
  );

-- UPDATE / DELETE: shared — любой член household (оба отмечают общую задачу
-- выполненной); personal — только owner. Паттерн goals (shared-коллаборативные
-- сущности правят оба), в отличие от wj_projects (жизненный цикл — только owner).
create policy "wj_tasks: shared editable by members, personal by owner"
  on public.wj_tasks
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

create policy "wj_tasks: shared deletable by members, personal by owner"
  on public.wj_tasks
  for delete
  to authenticated
  using (
    household_id = public.current_household_id()
    and (visibility = 'shared' or owner_profile_id = auth.uid())
  );


-- =============================================================================
-- Триггеры updated_at — отдельные wj_*_touch_updated_at на таблицы с updated_at
-- (wj_fields immutable-конфиг, только created_at → триггер не нужен).
-- Общая функция-хелпер (table-agnostic: пишет new.updated_at), три отдельных
-- триггера с именами per-table — в FF общего хелпера ещё не было, заводим тут.
-- =============================================================================
create or replace function public.wj_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger wj_projects_touch_updated_at
  before update on public.wj_projects
  for each row execute function public.wj_touch_updated_at();

create trigger wj_records_touch_updated_at
  before update on public.wj_records
  for each row execute function public.wj_touch_updated_at();

create trigger wj_tasks_touch_updated_at
  before update on public.wj_tasks
  for each row execute function public.wj_touch_updated_at();


-- =============================================================================
-- GRANTы (явные — "Automatically expose new tables" в проекте выключено)
-- =============================================================================
grant select, insert, update, delete on public.wj_projects to authenticated;
grant select, insert, update, delete on public.wj_fields   to authenticated;
grant select, insert, update, delete on public.wj_records  to authenticated;
grant select, insert, update, delete on public.wj_tasks    to authenticated;

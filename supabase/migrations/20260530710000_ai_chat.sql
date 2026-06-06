-- =============================================================================
-- Migration: ai_chat (Фаза 6.3)
-- =============================================================================
-- История переписки с AI-ассистентом.
--
-- Таблица:
--   ai_chat_messages — одно сообщение чата (user / assistant).
--   Привязана и к profile_id, и к household_id: владелец видит только свои,
--   но household_id нужен чтобы Edge Function знала, в контексте какой
--   семьи строить ответ (даже если у юзера несколько household — на сейчас
--   household один, но колонку оставляем правильно).
--
-- Инварианты:
--   * История — на пользователя (не на household): ассистент личный.
--   * Лимит 50 сообщений (роль user) в сутки на пользователя проверяется
--     на стороне Edge Function через COUNT — без хука/триггера, чтобы
--     не плодить тяжёлой проверки на каждый INSERT.
--   * Edge Function пишет от имени юзера через service_role (нам нужно
--     быть быстрыми и не зависеть от RLS-побочек).
-- =============================================================================

create table public.ai_chat_messages (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id)   on delete cascade,
  household_id  uuid not null references public.households(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  tokens_in     int,
  tokens_out    int,
  created_at    timestamptz not null default now()
);

create index ai_chat_messages_profile_created_idx
  on public.ai_chat_messages(profile_id, created_at desc);
create index ai_chat_messages_profile_today_idx
  on public.ai_chat_messages(profile_id, role, created_at desc);

comment on table  public.ai_chat_messages is 'История AI-ассистента (Фаза 6.3). Лимит 50 user-сообщений/сутки на профиль — проверяется в Edge Function.';
comment on column public.ai_chat_messages.role is 'user — сообщение от человека; assistant — ответ модели.';
comment on column public.ai_chat_messages.tokens_in is 'Только для assistant: tokens отправленные модели в этом раунде.';
comment on column public.ai_chat_messages.tokens_out is 'Только для assistant: tokens сгенерированные моделью.';


-- =============================================================================
-- RLS
-- =============================================================================
alter table public.ai_chat_messages enable row level security;

create policy "ai_chat_messages: owner reads own"
  on public.ai_chat_messages for select
  to authenticated
  using (profile_id = auth.uid());

create policy "ai_chat_messages: owner inserts own"
  on public.ai_chat_messages for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and household_id = public.current_household_id()
  );

create policy "ai_chat_messages: owner deletes own"
  on public.ai_chat_messages for delete
  to authenticated
  using (profile_id = auth.uid());


-- =============================================================================
-- GRANTы
-- =============================================================================
grant select, insert, delete on public.ai_chat_messages to authenticated;
grant select, insert, update, delete on public.ai_chat_messages to service_role;

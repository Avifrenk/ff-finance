-- =============================================================================
-- Migration: напоминания по задачам задачника (work-journal, Фаза 8)
-- =============================================================================
-- План: plans/2026-06-06-mvp-zadachnik.md (Фаза 8 «Напоминания по задачам»).
--
-- Отличие от событийных триггеров FF (20260530600100_notification_triggers.sql):
-- те кладут пуш в очередь по СОБЫТИЮ (insert/update данных). Напоминание о задаче
-- срабатывает по ВРЕМЕНИ — когда наступил wj_tasks.reminder_at. Событийным
-- триггером это не поймать (никто в этот момент таблицу не трогает), поэтому
-- нужен pg_cron, который раз в N минут опрашивает wj_tasks и кладёт наступившие
-- напоминания в notification_queue. Дальше всё как у всех: Edge Function send-push
-- (cron каждые 5 минут, 20260530600200) забирает unsent из очереди и шлёт пуш
-- «вслепую» — про задачник она ничего не знает.
--
-- Переиспользуем готовую push-инфраструктуру FF БЕЗ изменений: очередь
-- notification_queue (+ dedup_key из 20260530600100), push_subscriptions,
-- send-push, send_push_cron. Push-инфраструктура НЕ завязана на финансовые
-- таблицы (подтверждено ревью плана) — очереди достаточно строки.
--
-- ИДЕМПОТЕНТНОСТЬ — через notification_queue.dedup_key + on conflict do nothing
-- (как ВСЕ триггеры FF, образец 20260530600100), а НЕ новой колонкой на wj_tasks
-- (требование плана). dedup_key включает epoch(reminder_at): одно напоминание на
-- одну установку времени. Переставил reminder_at → новый ключ → новый пуш;
-- не трогал → ключ тот же → пуш ровно один раз за всё время.
--
-- АДРЕСАТ — только владелец задачи (owner_profile_id), даже для shared-задачи
-- (требование плана п.1: «profile_id владельца = owner_profile_id»). Напоминание
-- личное: его поставил владелец себе, незачем дёргать супруга.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. enqueue_wj_task_reminders() — опросная функция для крона
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: insert в notification_queue идёт от имени definer'а (postgres),
-- т.к. RLS закрывает прямой insert в очередь обычным ролям (как и у событийных
-- триггеров FF). Возвращает число РЕАЛЬНО поставленных в очередь напоминаний
-- (после дедупа) — удобно для ручной проверки `select enqueue_wj_task_reminders();`.
create or replace function public.enqueue_wj_task_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task  record;
  v_count integer := 0;
begin
  for v_task in
    select id, owner_profile_id, title, reminder_at
      from public.wj_tasks
      where reminder_at is not null
        and reminder_at <= now()
        and is_done = false
        -- Нижняя граница окна: на корректность не влияет (дедуп ниже всё равно
        -- не даст продублировать), но не даёт крону вечно пере-сканировать
        -- древние напоминания. Если очередь/крон лежали > суток — такое
        -- напоминание уже неактуально, тихо пропускаем.
        and reminder_at > now() - interval '1 day'
  loop
    insert into public.notification_queue (profile_id, title, body, url, dedup_key)
    values (
      v_task.owner_profile_id,
      '🔔 Напоминание',
      v_task.title,
      '/journal',
      'wj_task:' || v_task.id::text || ':'
        || extract(epoch from v_task.reminder_at)::bigint::text
    )
    on conflict (profile_id, dedup_key) where dedup_key is not null do nothing;

    -- FOUND после INSERT истинно, только если строка реально вставлена
    -- (а не отброшена on conflict) — считаем именно новые напоминания.
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

comment on function public.enqueue_wj_task_reminders() is 'Фаза 8 задачника: кладёт наступившие wj_tasks.reminder_at (не is_done, окно сутки) в notification_queue для владельца. Дедуп через dedup_key=wj_task:<id>:<epoch reminder_at>. Дёргается pg_cron каждые 5 минут; send-push (отдельный крон) шлёт пуш.';

-- Очередью/функцией заведует только крон (под postgres). Обычным ролям execute
-- ни к чему — иначе можно вручную флудить очередь. postgres как владелец функции
-- исполняет её независимо от grant'ов, так что крон не пострадает.
revoke all on function public.enqueue_wj_task_reminders() from public;


-- -----------------------------------------------------------------------------
-- 2. pg_cron: каждые 5 минут опрашиваем напоминания
-- -----------------------------------------------------------------------------
-- pg_cron уже включён в проекте (send_push_cron / fetch_ecb_rates_cron используют
-- cron.schedule напрямую, не создавая расширение) — повторяем тот же рабочий
-- паттерн, лишний create extension не трогаем. 5 минут — в тон send_push_every_5min:
-- суммарная задержка доставки в худшем случае ~10 мин (5 на постановку в очередь +
-- 5 на отправку), для личного напоминания о задаче приемлемо. pg_net тут не нужен —
-- мы только пишем в очередь, HTTP к функции делает уже существующий send_push_cron.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'wj_task_reminders_every_5min';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'wj_task_reminders_every_5min',
  '*/5 * * * *',
  $$select public.enqueue_wj_task_reminders();$$
);

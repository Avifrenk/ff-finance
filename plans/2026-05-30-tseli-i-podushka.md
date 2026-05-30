# План: Фаза 4 — Цели и подушка безопасности

Цель ветки `feat/tseli-i-podushka` — закрыть Фазу 4 из ROADMAP. После мержа у пары появляются:

1. Совместные (и личные) **цели** — карточки с прогресс-баром, оставшейся суммой, ETA по средней скорости пополнения.
2. **Автоматическое зачисление**: «X% дохода в эту цель» — срабатывает после `tick_schedules` на свежесозданных income-операциях.
3. Виджет **подушки безопасности** на Dashboard: «У вас X месяцев жизни без дохода» (totalBalance / avgMonthlyExpense за последние 3 месяца).

UX-фильтр Фазы 3 («поймёт ли жена с первого раза без объяснений?») остаётся главным критерием. На странице целей жена должна видеть три цифры: «сколько хотим», «сколько уже накопили», «сколько осталось» — в этом порядке. Никаких «73.4 % прогресса» без живой суммы рядом.

## Принципы

- **Цель — это плоская сущность, contributions — отдельный лог.** Решение: отдельная таблица `goal_contributions`, не `operations.goal_id`. Reasoning: contribution — это не «трата», это движение в накопительный план. Если зашить через `operations.goal_id`, пополнения смешаются с расходами в `CategoryBreakdown`/бюджетах, появятся ложные «расходы по категории Цели» в pie. Отдельная таблица — UI чище (отдельный список «пополнения цели»), агрегаты Фазы 3 не трогаются, а в будущем «контрибуция = пополнение брокерского счёта» не упрётся в семантику expense/income.
- **Всё в `base_currency` семьи.** Поле `currency` в `goals` не делаем (как у `budgets`). `target_amount` и сумма contribution хранятся в base_currency. Reasoning: одна валюта на семью → одна цифра «хотим 50 000 ₪ к свадьбе»; смена базовой валюты у семьи бывает раз в никогда — а если случится, переводим вручную. Если завтра захочется «копим в EUR» — добавим колонку отдельной миграцией.
- **Двухуровневая приватность.** У `goals` поле `visibility` (`personal` | `shared`), как у `accounts`. Личная цель видна только владельцу; семейная — обоим. Автозачисление с income-операции на shared-счёте идёт только на shared-цели; income на personal-счёте автора — только на его personal-цели. Это правило сохраняет инвариант приватности: партнёр не «доливает» в чужую цель неожиданно.
- **RLS с первого дня + GRANT-ы явные.** Тот же урок Фазы 2.10 / 3.4 — `service_role` не используется (auto-зачисление крутится в `tick_schedules`, которая `security definer`). На `authenticated` — явные политики SELECT/INSERT/UPDATE/DELETE.
- **Графики — inline SVG, как в Фазе 3.** Прогресс-бар цели — `<div>` с `width: ${pct}%` (как у `BudgetsProgress`). Никаких donut'ов для цели — у цели один параметр «как заполнено», donut тут переусложнение.
- **Считаем на клиенте.** Прогресс цели = сумма `goal_contributions.amount`. ETA = `(target - sum) / avg-per-day-since-first-contribution`. Подушка = `totalBalance / avg(monthlyExpense за последние 3 календарных месяца)`. Всё это десятки строк агрегации поверх уже загруженных данных.
- **UX-фильтр:** на карточке цели жена видит:
  ```
  🏖 Отпуск на Кипр
  ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░  73%
  10 950 / 15 000 ₪      ← осталось 4 050 ₪
  при текущем темпе — к 14 авг
  ```
  Никаких «base_currency», «contribution_id», «auto_percent_of_income» наружу не вылезает.
- **Build + tsc + lint чистые** перед коммитом каждой подфазы (как в Фазе 3).

## Фазы

- [x] **Фаза 4.1. Миграция `goals` + `goal_contributions` + RLS + GRANT.** _(SQL `supabase/migrations/20260530200000_goals.sql` применён к prod 2026-05-30 через `npm run db:push`. Триггер `goals_touch_updated_at`, partial unique index `goal_contributions_auto_unique` для дедупа auto-зачислений в Фазе 4.5. `types/database.ts` синхронизирован.)_
  - Миграция `supabase/migrations/20260530200000_goals.sql`:
    - `goals`:
      - `id uuid pk default gen_random_uuid()`
      - `household_id uuid not null references households on delete cascade`
      - `name text not null`
      - `target_amount numeric(14,2) not null check (target_amount > 0)`
      - `target_date date` — nullable (бессрочные накопления — подушка, «чёрный день» — без даты)
      - `visibility text not null check (visibility in ('personal','shared'))` default `'shared'`
      - `owner_profile_id uuid not null references profiles on delete restrict` — кто создал; для `personal` он же единственный, кто видит
      - `auto_percent_of_income numeric(5,2) not null default 0 check (auto_percent_of_income >= 0 and auto_percent_of_income <= 100)` — «процент с каждого дохода идёт в цель»
      - `icon text` (опционально, эмодзи)
      - `color text` (опционально, hex; иначе индиго по умолчанию)
      - `is_archived boolean not null default false` — после достижения цель можно «убрать с глаз», но не удалять (история contributions важна)
      - `created_at timestamptz not null default now()`
      - `updated_at timestamptz not null default now()`
    - `goal_contributions`:
      - `id uuid pk default gen_random_uuid()`
      - `goal_id uuid not null references goals on delete cascade`
      - `amount numeric(14,2) not null check (amount > 0)` — в `base_currency` семьи
      - `occurred_at date not null default current_date`
      - `author_profile_id uuid not null references profiles on delete restrict`
      - `source text not null default 'manual' check (source in ('manual','auto'))` — `auto` ставит `tick_schedules`, `manual` — пользователь
      - `source_operation_id uuid references operations on delete set null` — для `auto`: какой income-операцией порождён, чтобы UI мог показать «← из зарплаты 2026-06-01»
      - `note text`
      - `created_at timestamptz not null default now()`
    - Индексы: `goals(household_id, is_archived)`, `goal_contributions(goal_id, occurred_at desc)`, `goal_contributions(source_operation_id)` для дедупа в `tick_schedules`.
    - RLS:
      - `goals`:
        - SELECT: член household; если `visibility='personal'` — только `owner_profile_id = auth.uid()`.
        - INSERT: член household, `owner_profile_id = auth.uid()`.
        - UPDATE: член household, `visibility='shared'` (любой партнёр) ИЛИ автор (для `personal`).
        - DELETE: тот же предикат, что UPDATE.
      - `goal_contributions`:
        - SELECT: цель видна (см. выше) — через `exists (select 1 from goals g where g.id = goal_id and …)`.
        - INSERT: цель видна И `author_profile_id = auth.uid()`.
        - UPDATE: автор contribution.
        - DELETE: автор contribution ИЛИ автор цели (на случай, если кто-то ошибся пополнением чужой shared-цели).
    - GRANTы: `select, insert, update, delete on goals to authenticated`; то же на `goal_contributions`.
    - `service_role` явно не трогаем — `tick_schedules` уже `security definer`, ей RLS не мешает.
  - Применить: `npm run db:push`.
  - `types/database.ts` — добавить `goals`, `goal_contributions` (Row/Insert/Update). Без них хуки не типизируются.

- [x] **Фаза 4.2. Хуки `useGoals` / `useGoalContributions`.**
  - `src/hooks/useGoals.ts`:
    - `useGoals({ includeArchived?: boolean })` — список целей с учётом RLS (партнёр сам по visibility отфильтрован на БД).
    - `create(input)` / `update(id, patch)` / `archive(id)` / `unarchive(id)` / `remove(id)`.
    - Паттерн `ff:goals-changed` CustomEvent, как `useBudgets`/`useSchedules`.
    - Defensive: при `42P01` (миграция ещё не применена) — пустой список, без падения.
  - `src/hooks/useGoalContributions.ts`:
    - `useGoalContributions(goalId?: string)` — если `goalId` задан, грузит contributions только этой цели; если `undefined` — все видимые contributions (нужно Dashboard'у для агрегатов).
    - `contribute(goalId, amount, occurredAt?, note?)` — manual contribution.
    - `removeContribution(id)` — для отката ошибочного пополнения.
    - Событие `ff:goal-contributions-changed`.

- [x] **Фаза 4.3. Чистые агрегаты `src/lib/goals.ts`.**
  - `goalProgress(goal, contributions): { saved, remaining, percent, contributionsCount, firstContributionAt, lastContributionAt }` — сумма и метаданные. `percent = min(saved/target, 1)`, фактический percent (для текста «переполнено на 12%») в отдельном поле `actualPercent`.
  - `goalEta(goal, contributions, today = new Date()): { etaDate: Date | null, perDay: number, reason: 'no-contributions' | 'too-slow' | 'done' | 'on-track' }`:
    - Если `saved >= target` → `reason='done', etaDate=null`.
    - Если contributions пуст → `reason='no-contributions'`.
    - `perDay = saved / daysSinceFirstContribution` (мин. 1 день, чтобы не делить на 0).
    - Если `perDay <= 0` (странный кейс) → `reason='too-slow'`.
    - `etaDate = today + remaining/perDay дней`.
    - Если `target_date` задан и `etaDate > target_date` → дополнительный флаг `behindTarget: true` (UI подсветит).
  - `safetyCushion(monthlyExpenses: { yyyymm: string; expense: number }[], totalBalance): { months: number | null, avgExpense: number, monthsUsed: number }`:
    - Берём последние 3 **полных** календарных месяца (не включая текущий — он неполный).
    - Если есть хотя бы 1 месяц с `expense > 0` — `avg = sum / months_with_data`; `months = totalBalance / avg`.
    - Если все 3 месяца с `expense = 0` или их нет — `months = null` (UI напишет «нет данных»).
  - Юнит-тестов всё ещё нет в проекте (как и в Фазе 3), но в комментариях фиксируем 2-3 примера ввод/вывод, чтобы хелпер был самодокументирующимся.

- [ ] **Фаза 4.4. Страница `/goals` + роут.**
  - Новый файл `src/pages/Goals.tsx` + роут в `App.tsx` (между `operations` и `settings`).
  - Пункт в `<AppLayout>` навигации: «Цели» (между «Операции» и «Настройки»).
  - Содержимое:
    - Заголовок + кнопка «Новая цель» (открывает диалог).
    - Список карточек целей (одна карточка = одна цель). Сначала активные (`is_archived=false`), затем archived (в свёрнутом блоке «Достигнутые»).
    - Карточка цели (компонент `<GoalCard>`):
      - Иконка + название + бейдж visibility (🏠 семейная / 🧍 личная).
      - Прогресс-бар (`<div>` с `width: ${percent*100}%`, цвет — `goal.color` или индиго).
      - Под баром: `saved / target ₪` крупно, мелким серым — «осталось N ₪».
      - Если `etaDate` есть — «при текущем темпе — к 14 авг». Если `target_date` задан и `etaDate` позже — добавляем «⚠ позже плана».
      - Кнопки «Пополнить» (открывает диалог), «⋯» (меню: «Изменить», «Архивировать», «Удалить»).
      - Если `is_archived` — без кнопок, только итог.
    - Пустое состояние: «Пока ни одной цели — отпуск, первый взнос, чёрный день. Нажмите ➕ чтобы начать копить.»
  - Диалог «Новая цель» (`<GoalDialog>`, по стилю `AddOperationDialog`):
    - Поля: иконка-пикер (10 предзаданных эмодзи), название, target_amount, target_date (опционально), visibility (radio), auto_percent_of_income (0..100, slider или number-input, по умолчанию 0).
    - Color-пикер — отложим (по умолчанию индиго) → в «Не входит». Если потом захочется — отдельной маленькой веткой.
  - Диалог «Пополнить цель»:
    - Сумма, дата (по умолчанию сегодня), комментарий (опционально).
    - На submit — `contribute(goalId, amount, occurredAt, note)`.
  - Реактивность: после `create`/`contribute`/`update` — Dashboard и Goals подхватывают через CustomEvent.

- [ ] **Фаза 4.5. Автозачисление в `tick_schedules` + ручной триггер.**
  - Миграция `supabase/migrations/20260530200500_tick_schedules_auto_goals.sql`:
    - Переписать `tick_schedules()` так, чтобы после `insert into operations` для income-операций вызывался хелпер `apply_auto_goal_contributions(p_operation_id)`.
    - Новая функция `apply_auto_goal_contributions(p_operation_id uuid) returns int` (`security definer`):
      - Грузит операцию; если `kind != 'income'` → выходит, `return 0`.
      - Конвертирует amount из валюты счёта в `households.base_currency` через **существующий хелпер**. В проекте конвертация делается на клиенте через `convertMoney`/`useFxRates`. На SQL-стороне курсов в таблице `fx_rates` достаточно: `select rate from fx_rates where base_code = ? and quote_code = ? and as_of <= ? order by as_of desc limit 1` (90-дневное окно — fallback на ECB cross EUR). Пишем SQL-функцию `convert_to_base(amount, from_currency, household_id, on_date) returns numeric` в этой же миграции, чтобы не дублировать. Если курса нет — функция возвращает `null`, и автозачисление пропускается с `raise notice`, операция остаётся (важно: не падаем).
      - Дальше: для каждой `goals` записи с `auto_percent_of_income > 0` И той же `household_id`:
        - Если операция на счёте с `visibility='shared'` → цель должна быть `shared`.
        - Если операция на счёте с `visibility='personal'` (значит автор = владелец счёта) → цель должна быть `personal` И `owner_profile_id = author_profile_id`.
        - Иначе — пропуск.
      - Вставка в `goal_contributions`: `amount = round(income_in_base * percent / 100, 2)`, `source='auto'`, `source_operation_id = p_operation_id`, `author_profile_id = автор операции`.
      - **Идемпотентность:** unique-индекс на `(goal_id, source_operation_id)` where `source_operation_id is not null` — если `tick_schedules` запустили дважды (или дёрнули вручную из Settings), второй раз скип через `on conflict do nothing`. Это уже доделается в той же миграции.
    - В `tick_schedules`: после `insert into operations … returning id`, для income-операции вызвать `apply_auto_goal_contributions(new_id)`. Для expense — не вызывать.
  - Ручной триггер: на странице Goals или Settings — кнопка «Прокрутить расписания сейчас» вызывает `supabase.rpc('tick_schedules')`. Если такая кнопка уже есть в Фазе 2.9 — переиспользуем, ничего нового.

- [ ] **Фаза 4.6. Виджет подушки безопасности на Dashboard.**
  - Новый компонент `src/components/SafetyCushion.tsx`:
    - Принимает `monthlyExpenses` (массив `{ yyyymm, expense }`) и `totalBalance`, обе цифры в `base_currency`.
    - Считает `safetyCushion()` из `lib/goals.ts`.
    - Рендер:
      - Заголовок «🛟 Подушка безопасности».
      - Большая цифра «X месяцев жизни без дохода». Округление до 0.5 (например 4.5 мес).
      - Мелким серым: «средний расход — 12 400 ₪/мес».
      - Если `months === null` → текст «Пока нет данных за прошлые месяцы».
      - Если `months < 3` → подсветка янтарная, текст «маловато, обычно советуют 3–6».
      - Если `months >= 3` и `< 6` → нейтральный.
      - Если `>= 6` → зелёная плашка «🎉 надёжный запас».
  - На Dashboard:
    - Считать `monthlyExpenses` для последних 3 полных месяцев через тот же `monthTotals(operations, …, monthRangeFor(yyyymm))`.
    - Положить компонент **прямо под** карточкой «Общий баланс» (это самое естественное место — «сколько у нас + на сколько хватит»).
  - Производный показатель — при добавлении/удалении операции должен пересчитаться сам, так как Dashboard перерисуется по `ff:operations-changed`.

- [ ] **Фаза 4.7. Связка целей с Dashboard (мини-виджет).**
  - На Dashboard, ниже бюджета — секция «Цели» (если в семье есть хотя бы 1 активная цель):
    - Список 3 ближайших к завершению (по `percent`).
    - У каждой строки: иконка + название + узкий прогресс-бар + `saved / target ₪`.
    - Тап → переход на `/goals`.
  - Если ни одной цели — секция не рендерится (как в `BudgetsProgress`).
  - Компонент `<GoalsSummary>`. Использует тот же `useGoals` + `useGoalContributions()`.

- [ ] **Фаза 4.8. UX-проверка в браузере + edge cases.**
  - `npm run dev` → http://localhost:5173.
  - Сценарий жены:
    1. Открывает Dashboard → видит подушку «5 месяцев», ниже — мини-виджет «Цели: Отпуск 73%, Свадьба 12%».
    2. Жмёт «Цели» → видит карточки, жмёт «Пополнить» → вводит 500 ₪ → возвращается, прогресс-бар плавно дополз.
    3. Создаёт новую цель «Айфон 4 500 ₪, к 1 сен», ставит auto 5% — на следующем income сама увидит, что цель пополнилась без её участия.
  - Edge cases:
    - Цель без contributions → ETA «оценка появится после первого пополнения», прогресс 0%, бар пустой.
    - Цель достигнута → плашка «🎉 Достигнуто», кнопка «Архивировать».
    - Цель переполнена (saved > target) → бар клипается на 100%, под ним «+1 200 ₪ сверх плана».
    - Личная цель + смена `viewMode` на семейный → личные цели партнёра не видны (это RLS), свои — видны всегда (личное прокрашено 🧍).
    - Подушка при нулевом расходе за 3 месяца → «нет данных».
    - Подушка при `totalBalance < 0` (овердрафт) → отрицательное число месяцев. Пишем «расходов больше, чем активов» (защитный кейс, на будущее).
    - Auto-зачисление: задал 50% на цель → запустил `tick_schedules` вручную → income 10 000 → contribution 5 000 (round half away from zero). Второй запуск той же tick → unique constraint, contribution не дублируется.
    - Курса нет на дату income-операции → contribution не создаётся, операция всё равно создаётся (важно: tick'у нельзя падать на одной строке).
    - Удалил income-операцию (для которой было auto-contribution) → благодаря `on delete set null` на `source_operation_id`, contribution остаётся (это «деньги уже отложены, минус прихода — не значит минус накоплений»). Если позже захочется «откатывать вместе» — отдельная фича.
  - **Build + tsc + lint:** `npm run build && npx tsc --noEmit && npm run lint` чистые перед коммитом каждой подфазы (особенно перед мержем).

- [ ] **Фаза 4.9. Закрытие плана + ROADMAP + рефлексия.**
  - Все подфазы `[x]`, блок «Итог» внизу плана с фактическими списком файлов/решений.
  - В `ROADMAP.md`: три строки Фазы 4 на `[x]` + ✅ у заголовка фазы.
  - `.business/история/2026-05-30-tseli-i-podushka.md` по 5-пунктовому формату из CLAUDE.md (задача / как решал / решил ли / что можно было лучше / как было — как стало).
  - Merge `feat/tseli-i-podushka` → `main` через `git merge --no-ff` с подробным сообщением.

## Открытые вопросы

- **Хранить ли contribution в произвольной валюте (например, перевёл из брокера в USD)?** Решено: нет, только в `base_currency`. Если деньги в другой валюте — пользователь сам конвертит при вводе. Это та же логика, что для `budgets`. Если станет больно — добавим `currency` в `goal_contributions` отдельной миграцией.
- **Автозачисление по `expense`-операциям («округление до сотни — в подушку»)?** Полезная фича типа «keep the change», но это отдельный механизм (не процент с дохода). Не в этой ветке. Положим в backlog как `feat/round-up-savings`.
- **Уведомления «цель достигнута» / «осталось 10%»?** Web Push — Фаза 8. Сейчас только визуальная плашка на карточке.
- **Подушка с поправкой на «обязательные» категории?** В реальности «жизнь без дохода» считается по обязательным платежам (аренда, ваад, еда), а не по тратам на бары. Сейчас считаем по всем расходам — это завышенная оценка месяцев осталось / заниженная подушки. Решение: оставить грубую цифру, мелким серым подписать «по среднему расходу за 3 мес». Уточнение «обязательные» — отдельная вкладка категорий (`is_essential` boolean) в будущей ветке `feat/essential-categories`.
- **Что делать, если у цели сменили `target_amount` после нескольких contributions?** Просто пересчитывается процент. История contributions не трогается. ETA пересчитается. Это нормальное поведение.
- **Цель в `personal` visibility и партнёр случайно создал auto%?** Не сможет: `auto_percent_of_income` правит автор цели, у партнёра RLS на UPDATE прикрывает (политика «UPDATE для shared любым партнёром, для personal — только автором»).

## Инварианты

- Всё хранится и считается в `base_currency` семьи. Конверсия — `convertMoney` (на клиенте) и `convert_to_base()` (на сервере, для `apply_auto_goal_contributions`).
- Двухуровневая приватность: `goals.visibility` (`personal` | `shared`) + RLS. Auto-зачисление никогда не «протаскивает» деньги между уровнями приватности (shared income → только shared goals; personal income автора → только его personal goals).
- RLS с первого дня. GRANT для `authenticated` явный. `service_role` явно не трогаем.
- Идемпотентность auto-зачисления: unique-индекс `(goal_id, source_operation_id) where source_operation_id is not null` + `on conflict do nothing`. Повторный `tick_schedules` или ручной вызов rpc не дублируют contribution.
- `transfer_id != null` операции не дают autocontribution (переводы между счетами — не доход). В `apply_auto_goal_contributions` явный фильтр.
- UI: прогресс-бар + одна цифра «осталось N ₪» — главный паттерн. Процент — мелким серым (если вообще). Никаких «73.4 %» без живой суммы рядом.
- Никаких UI-библиотек. SVG/CSS, как в Фазе 3.
- `npm run build && npx tsc --noEmit && npm run lint` чистые перед коммитом каждой подфазы.

## Не входит в эту ветку (намеренно)

- **Round-up savings** («округление сдачи в подушку») — отдельная ветка `feat/round-up-savings`.
- **Эссенциальные категории** для более точной подушки — отдельная ветка `feat/essential-categories`.
- **Web Push** «цель достигнута» — Фаза 8.
- **«Снятие» с цели** (откатить пополнение на основной счёт операцией) — пока только «удалить contribution». Это не возврат денег на счёт, это исправление учётной ошибки. Если когда-нибудь захочется «снять с цели → income на счёт» — отдельная маленькая фича.
- **Несколько contribution’ов в день** — поддерживаем (каждый — отдельная запись). UI группировку «3 пополнения сегодня = 1 строка» не делаем.
- **Color-пикер у целей** — по умолчанию индиго; иконка-пикер делаем, color — позже.
- **Цели в крипте** — Фаза 5. Здесь только фиатные.
- **Долги между супругами как «отрицательная цель»** — Фаза 7.

## Деплой миграций к prod-БД

Одной командой, без участия пользователя:

```
npm run db:push
```

Скрипт `scripts/db-push.mjs` подхватит connection-URL из `FF_DB_URL` или `~/.config/ff-finance/connection`. Если упадёт SASL auth — попросить пользователя ротировать пароль в Supabase Dashboard и пересохранить файл по инструкции из `scripts/db-push.mjs`. В `.env.local` не лезть — глобальный hook всё равно не пустит, и пароль там не лежит.

PAT для Edge Functions в этой ветке **не нужен** — никаких новых Edge Functions не появляется. `tick_schedules()` уже на pg_cron (Фаза 2.9), мы только переписываем её тело и добавляем функцию-хелпер. Это обычный SQL-патч.

## Итог

_(Заполнится в конце ветки.)_

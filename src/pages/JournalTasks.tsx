import { useCallback, useMemo, useRef, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useWjTasks, type WjTask, type UpdateWjTaskInput } from '../hooks/useWjTasks'
import { useWjLinkTargets, type WjLinkTarget } from '../hooks/useWjLinkTargets'

const MAX_TITLE = 200

// Локальная дата YYYY-MM-DD (не UTC — иначе поздним вечером «сегодня» съедет).
function todayLocal() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

// «6 июня», «вчера», «завтра» — для подписи дня у задач не из «сегодня».
function dayLabel(dateStr: string, today: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000)
  if (diff === 0) return 'Сегодня'
  if (diff === -1) return 'Вчера'
  if (diff === 1) return 'Завтра'
  return DATE_FMT.format(d)
}

// Под-таб «Задачи» (/journal). По умолчанию — «Сегодня»; «Просрочено» вверху красным;
// предстоящее свёрнуто. Грузим все видимые задачи и раскладываем по дням на клиенте
// (объёмы v1 — единицы-десятки задач).
export function JournalTasks() {
  const { household } = useApp()
  const today = todayLocal()
  const { tasks, loading, create, update, toggleDone, remove } = useWjTasks()
  const { targets, resolve } = useWjLinkTargets()

  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState<WjLinkTarget | null>(null)
  const [upcomingOpen, setUpcomingOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const { overdue, todayTasks, upcoming, noDate } = useMemo(() => {
    const overdue: WjTask[] = []
    const todayTasks: WjTask[] = []
    const upcoming: WjTask[] = []
    const noDate: WjTask[] = []
    for (const t of tasks) {
      if (!t.due_date) noDate.push(t)
      else if (t.due_date === today) todayTasks.push(t)
      else if (t.due_date < today) {
        if (!t.is_done) overdue.push(t) // закрытые из прошлого не тревожим
      } else upcoming.push(t)
    }
    // просрочка: самые старые сверху; предстоящее: ближайшие сверху
    overdue.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    upcoming.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    return { overdue, todayTasks, upcoming, noDate }
  }, [tasks, today])

  const handleAdd = useCallback(async () => {
    const value = draft.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await create({
        title: value,
        due_date: today,
        visibility: 'personal',
        project_id: link?.projectId ?? null,
        record_id: link?.recordId ?? null,
      })
      setDraft('')
      setLink(null)
      setLinkOpen(false)
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }, [draft, busy, create, today, link])

  if (!household) return null

  const todayDone = todayTasks.filter((t) => t.is_done).length
  const isEmpty =
    !loading &&
    overdue.length === 0 &&
    todayTasks.length === 0 &&
    upcoming.length === 0 &&
    noDate.length === 0

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Быстрый ввод: title + Enter (как Покупки) */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_TITLE))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAdd()
              }
            }}
            placeholder="Новое дело на сегодня…"
            autoFocus
            enterKeyHint="done"
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => void handleAdd()}
            disabled={!draft.trim() || busy}
            className="px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-2xl font-medium disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
            aria-label="Добавить"
          >
            +
          </button>
        </div>

        {/* Привязка к проекту/записи — спрятана за кнопкой, не на виду */}
        {link ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-1">
              🔗 {link.context ? `${link.context} · ${link.label}` : link.label}
              <button
                onClick={() => setLink(null)}
                className="text-indigo-400 hover:text-indigo-600"
                aria-label="Убрать привязку"
              >
                ×
              </button>
            </span>
          </div>
        ) : linkOpen ? (
          <LinkPicker
            targets={targets}
            onPick={(t) => {
              setLink(t)
              setLinkOpen(false)
            }}
            onClose={() => setLinkOpen(false)}
          />
        ) : (
          <button
            onClick={() => setLinkOpen(true)}
            className="text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
          >
            🔗 привязать к проекту
          </button>
        )}
      </div>

      {loading && tasks.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
      )}

      {/* Просрочено — вверху, красным */}
      {overdue.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-rose-600 dark:text-rose-400 px-1">
            ⚠ Просрочено · {overdue.length}
          </h2>
          <ul className="space-y-1.5">
            {overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                overdue
                link={resolve(t.project_id, t.record_id)}
                targets={targets}
                onToggle={toggleDone}
                onUpdate={update}
                onRemove={remove}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Сегодня */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Сегодня
          </h2>
          {todayTasks.length > 0 && (
            <span className="text-xs text-slate-400">
              {todayDone}/{todayTasks.length} закрыто
            </span>
          )}
        </div>
        {todayTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              На сегодня дел нет. Впишите первое сверху ↑
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {todayTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                link={resolve(t.project_id, t.record_id)}
                targets={targets}
                onToggle={toggleDone}
                onUpdate={update}
                onRemove={remove}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Без срока */}
      {noDate.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 px-1">
            Без срока · {noDate.length}
          </h2>
          <ul className="space-y-1.5">
            {noDate.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                link={resolve(t.project_id, t.record_id)}
                targets={targets}
                onToggle={toggleDone}
                onUpdate={update}
                onRemove={remove}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Предстоящее — свёрнуто */}
      {upcoming.length > 0 && (
        <section className="space-y-2">
          <button
            onClick={() => setUpcomingOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>📅 Предстоящее · {upcoming.length}</span>
            <span aria-hidden>{upcomingOpen ? '▾' : '▸'}</span>
          </button>
          {upcomingOpen && (
            <ul className="space-y-1.5">
              {upcoming.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  showDate
                  link={resolve(t.project_id, t.record_id)}
                  targets={targets}
                  onToggle={toggleDone}
                  onUpdate={update}
                  onRemove={remove}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {isEmpty && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Здесь будут ваши дела по дням. Впишите первое в поле сверху и нажмите Enter.
          </p>
        </div>
      )}
    </div>
  )
}

// timestamptz ISO ↔ значение <input type="datetime-local"> (локальное время).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}
function fromLocalInput(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

function TaskRow({
  task,
  today,
  overdue = false,
  showDate = false,
  link,
  targets,
  onToggle,
  onUpdate,
  onRemove,
}: {
  task: WjTask
  today: string
  overdue?: boolean
  showDate?: boolean
  link: WjLinkTarget | null
  targets: WjLinkTarget[]
  onToggle: (id: string, isDone: boolean) => Promise<unknown>
  onUpdate: (id: string, patch: UpdateWjTaskInput) => Promise<unknown>
  onRemove: (id: string) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [linkEditOpen, setLinkEditOpen] = useState(false)

  const saveTitle = async () => {
    const v = title.trim()
    if (v && v !== task.title) await onUpdate(task.id, { title: v })
    else setTitle(task.title)
    setEditing(false)
  }

  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          onClick={() => void onToggle(task.id, !task.is_done)}
          aria-label={task.is_done ? 'Переоткрыть' : 'Закрыть задачу'}
          className={`shrink-0 h-7 w-7 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.is_done
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'
          }`}
        >
          {task.is_done && <span className="text-sm leading-none">✓</span>}
        </button>

        {editing ? (
          <input
            type="text"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveTitle()
              if (e.key === 'Escape') {
                setTitle(task.title)
                setEditing(false)
              }
            }}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`flex-1 text-left text-base break-words ${
              task.is_done
                ? 'text-slate-400 dark:text-slate-500 line-through'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {task.title}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              {(overdue || showDate) && task.due_date && (
                <span className={overdue ? 'text-rose-500' : 'text-slate-400'}>
                  {dayLabel(task.due_date, today)}
                </span>
              )}
              {link && (
                <span className="text-indigo-500 dark:text-indigo-400">
                  🔗 {link.context ? `${link.context} · ${link.label}` : link.label}
                </span>
              )}
              {task.reminder_at && (
                <span className="text-slate-400">⏰ {toLocalInput(task.reminder_at).slice(11)}</span>
              )}
              {task.visibility === 'shared' && <span className="text-slate-400">общая</span>}
            </span>
          </button>
        )}

        <button
          onClick={() => setLinkEditOpen((v) => !v)}
          aria-label="Изменить задачу"
          className="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <span aria-hidden className="text-lg leading-none">⋯</span>
        </button>
      </div>

      {/* Панель редактирования: перенос дня, напоминание, привязка, удаление */}
      {linkEditOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <span className="block">Срок</span>
              <input
                type="date"
                value={task.due_date ?? ''}
                onChange={(e) => void onUpdate(task.id, { due_date: e.target.value || null })}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <span className="block">Напоминание</span>
              <input
                type="datetime-local"
                value={toLocalInput(task.reminder_at)}
                onChange={(e) =>
                  void onUpdate(task.id, { reminder_at: fromLocalInput(e.target.value) })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          {/* Привязка */}
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <span className="block">Привязка к проекту</span>
            {task.project_id ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 text-sm">
                  🔗 {link ? (link.context ? `${link.context} · ${link.label}` : link.label) : 'проект'}
                </span>
                <button
                  onClick={() => void onUpdate(task.id, { project_id: null, record_id: null })}
                  className="text-sm text-slate-400 hover:text-rose-500"
                >
                  убрать
                </button>
              </div>
            ) : linkEditOpen ? (
              <LinkPicker
                targets={targets}
                onPick={(t) =>
                  void onUpdate(task.id, { project_id: t.projectId, record_id: t.recordId })
                }
                onClose={() => setLinkEditOpen(false)}
              />
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              onClick={async () => {
                if (confirm(`Удалить задачу «${task.title}»?`)) await onRemove(task.id)
              }}
              className="text-sm text-rose-500 hover:text-rose-600"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// Один автокомплит-поиск «проект · клиент» вместо двух каскадных дропдаунов.
function LinkPicker({
  targets,
  onPick,
  onClose,
}: {
  targets: WjLinkTarget[]
  onPick: (t: WjLinkTarget) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const list = q ? targets.filter((t) => t.search.includes(q)) : targets
    return list.slice(0, 20)
  }, [targets, q])

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Проект или клиент…"
          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={onClose}
          className="px-3 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          Отмена
        </button>
      </div>
      {targets.length === 0 ? (
        <p className="px-2 py-3 text-sm text-slate-400">
          Проектов пока нет — создайте в под-табе «Проекты». Дело можно оставить и без привязки.
        </p>
      ) : matches.length === 0 ? (
        <p className="px-2 py-3 text-sm text-slate-400">Ничего не нашлось.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {matches.map((t) => (
            <li key={`${t.projectId}:${t.recordId ?? 'self'}`}>
              <button
                onClick={() => onPick(t)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t.context ? (
                  <span className="text-slate-900 dark:text-slate-100">
                    {t.label}{' '}
                    <span className="text-slate-400">· {t.context}</span>
                  </span>
                ) : (
                  <span className="text-slate-900 dark:text-slate-100">🗂 {t.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

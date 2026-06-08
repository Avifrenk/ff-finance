import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects } from '../hooks/useWjProjects'
import { useWjFields } from '../hooks/useWjFields'
import { useWjRecords } from '../hooks/useWjRecords'
import { useWjClients, type WjClient } from '../hooks/useWjClients'
import { JournalProjectAnalytics } from '../components/JournalProjectAnalytics'
import { recordSummary, todayLocalISO } from '../lib/wjValues'
import type { WjField } from '../hooks/useWjFields'

// Карточка проекта (/journal/projects/:id) — список КЛИЕНТОВ. Под каждым клиентом
// (отдельный экран) — заказы и комментарии. Аналитика — по всем заказам проекта.
export function JournalProject() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { household } = useApp()
  const { projects, loading: pLoading } = useWjProjects({ includeArchived: true })
  const { fields, clientFields, orderFields, loading: fLoading } = useWjFields(id)
  const { records } = useWjRecords(id) // все заказы проекта — для аналитики и счётчика
  const { clients, loading: cLoading, create } = useWjClients(id)

  const today = todayLocalISO()
  const [adding, setAdding] = useState(false)

  // Сколько заказов у каждого клиента (по client_id).
  const orderCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of records) {
      if (!r.client_id) continue
      m.set(r.client_id, (m.get(r.client_id) ?? 0) + 1)
    }
    return m
  }, [records])

  if (!household || !id) return null

  const project = projects.find((p) => p.id === id)

  if (!pLoading && !project) {
    return (
      <div className="space-y-3">
        <p className="text-slate-500">Проект не найден или недоступен.</p>
        <Link to="/journal/projects" className="text-indigo-600 dark:text-indigo-400 text-sm">
          ← К списку проектов
        </Link>
      </div>
    )
  }

  async function addClient() {
    if (adding) return
    setAdding(true)
    try {
      const c = await create({})
      navigate(`/journal/projects/${id}/clients/${c.id}`)
    } finally {
      setAdding(false)
    }
  }

  const hasFields = fields.length > 0
  const isEmpty = !cLoading && clients.length === 0

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          to="/journal/projects"
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← Проекты
        </Link>
        <Link
          to={`/journal/projects/${id}/fields`}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          ⚙️ Поля{!fLoading && hasFields ? ` · ${fields.length}` : ''}
        </Link>
      </div>

      <header className="flex items-center gap-3">
        <span
          className="h-11 w-11 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: project?.color ?? '#e2e8f0' }}
        >
          {project?.icon ?? '📁'}
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
            {project?.name ?? '…'}
          </h2>
          <p className="text-xs text-slate-400">
            {project?.visibility === 'shared' ? '👥 общий · виден обоим' : '🧍 только я'}
            {project?.is_archived ? ' · в архиве' : ''}
            {!cLoading && clients.length > 0 ? ` · клиентов: ${clients.length}` : ''}
          </p>
        </div>
      </header>

      {!fLoading && !hasFields ? (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">🧱</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Сначала настройте поля проекта — из них собираются карточки клиентов и заказы
            (имя, телефон, сумма, статус и т.п.).
          </p>
          <Link
            to={`/journal/projects/${id}/fields`}
            className="inline-block px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
          >
            Настроить поля
          </Link>
        </section>
      ) : (
        <>
          {records.length > 0 && (
            <JournalProjectAnalytics
              records={records}
              fields={fields}
              clients={clients}
              clientFields={clientFields}
            />
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">Клиенты проекта.</p>
            {hasFields && clients.length > 0 && (
              <button
                onClick={() => void addClient()}
                disabled={adding}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors disabled:opacity-50"
              >
                + Клиент
              </button>
            )}
          </div>

          {cLoading && clients.length === 0 && <p className="text-sm text-slate-400">Загрузка…</p>}

          {isEmpty && hasFields && (
            <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
              <div className="text-4xl mb-2">🧑‍🤝‍🧑</div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Клиентов пока нет. Заведите первого — внутри карточки добавите заказы и
                комментарии.
              </p>
              <button
                onClick={() => void addClient()}
                disabled={adding}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                + Добавить клиента
              </button>
            </section>
          )}

          {clients.length > 0 && (
            <ul className="space-y-2">
              {clients.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  fields={clientFields.length > 0 ? clientFields : orderFields}
                  projectId={id}
                  today={today}
                  orders={orderCount.get(c.id) ?? 0}
                  hasOrders={orderFields.length > 0}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// Строка клиента в списке: имя (из client-полей) + статус/срок + число заказов.
function ClientRow({
  client,
  fields,
  projectId,
  today,
  orders,
  hasOrders,
}: {
  client: WjClient
  fields: WjField[]
  projectId: string
  today: string
  orders: number
  hasOrders: boolean
}) {
  const summary = recordSummary(client.values, fields, today)
  const title = summary.title === 'Без имени' ? 'Без имени' : summary.title

  return (
    <li>
      <Link
        to={`/journal/projects/${projectId}/clients/${client.id}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <span className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-sm shrink-0">
          🧑
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-slate-900 dark:text-slate-100 font-medium">
            {title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            {hasOrders && (orders > 0 ? <span>📦 заказов: {orders}</span> : <span>нет заказов</span>)}
            {summary.status && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-slate-700 dark:text-slate-200"
                style={{ background: summary.status.color ?? '#e2e8f0' }}
              >
                {summary.status.value}
              </span>
            )}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">
          ›
        </span>
      </Link>
    </li>
  )
}

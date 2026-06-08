import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects } from '../hooks/useWjProjects'
import { useWjFields } from '../hooks/useWjFields'
import { useWjClients } from '../hooks/useWjClients'
import { useWjRecords } from '../hooks/useWjRecords'
import { useWjComments } from '../hooks/useWjComments'
import { JournalRecordCard } from '../components/JournalRecordCard'
import { FieldValueEditor } from '../components/JournalFieldEditors'
import { recordTitle, collectPurposes, todayLocalISO } from '../lib/wjValues'

// Карточка клиента (/journal/projects/:id/clients/:clientId): шапка с client-полями,
// блок заказов (order-поля) и лента комментариев.
export function JournalClient() {
  const { id, clientId } = useParams<{ id: string; clientId: string }>()
  const navigate = useNavigate()
  const { household, profile, members } = useApp()
  const { projects } = useWjProjects({ includeArchived: true })
  const { clientFields, orderFields } = useWjFields(id)
  const { clients, replaceValues, remove: removeClient } = useWjClients(id)
  const {
    records: orders,
    create: createOrder,
    replaceValues: saveOrder,
    remove: removeOrder,
  } = useWjRecords(id, clientId)
  const { comments, add: addComment, remove: removeComment } = useWjComments(clientId)

  const today = todayLocalISO()
  const [addingOrder, setAddingOrder] = useState(false)
  const [newOrder, setNewOrder] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const client = clients.find((c) => c.id === clientId)
  const orderPurposes = useMemo(
    () => collectPurposes(orders, orderFields),
    [orders, orderFields],
  )
  const clientPurposes = useMemo(
    () => (client ? collectPurposes([client], clientFields) : []),
    [client, clientFields],
  )

  // Имя автора комментария.
  const nameOf = useCallback(
    (pid: string): string => {
      if (profile && pid === profile.id) return 'Вы'
      const m = members.find((x) => x.profile_id === pid)
      return m?.display_name ?? 'Партнёр'
    },
    [profile, members],
  )

  // Правка одного client-поля: пересобрать values (undefined = удалить) и сохранить.
  const setClientVal = useCallback(
    (key: string, value: unknown) => {
      if (!client) return
      const next = { ...client.values }
      if (value === undefined) delete next[key]
      else next[key] = value
      void replaceValues(client.id, next)
    },
    [client, replaceValues],
  )

  if (!household || !id || !clientId) return null

  const project = projects.find((p) => p.id === id)
  const clientName = client ? recordTitle(client.values, clientFields) : '…'

  async function addOrder() {
    if (addingOrder) return
    setAddingOrder(true)
    try {
      const rec = await createOrder({})
      setNewOrder(rec.id)
    } finally {
      setAddingOrder(false)
    }
  }

  async function sendComment() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await addComment(text)
  }

  async function onDeleteClient() {
    if (!client) return
    if (confirm('Удалить клиента вместе со всеми его заказами и комментариями?')) {
      await removeClient(client.id)
      navigate(`/journal/projects/${id}`)
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        to={`/journal/projects/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        ← {project?.name ?? 'Проект'}
      </Link>

      <header className="flex items-center gap-3">
        <span className="h-11 w-11 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xl shrink-0">
          🧑
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
            {clientName === 'Без имени' ? 'Новый клиент' : clientName}
          </h2>
          <p className="text-xs text-slate-400">Карточка клиента</p>
        </div>
      </header>

      {/* Шапка клиента — client-поля */}
      {clientFields.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-4 py-4 space-y-4">
          {clientFields.map((f) => (
            <div key={f.id}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                {f.label}
                {f.is_required && <span className="text-rose-400 ml-0.5">*</span>}
              </label>
              <FieldValueEditor
                field={f}
                value={client?.values[f.key]}
                purposes={clientPurposes}
                onChange={(v) => setClientVal(f.key, v)}
              />
            </div>
          ))}
        </section>
      ) : (
        <p className="text-xs text-slate-400">
          Нет полей клиента. Отметьте нужные поля как «поле клиента» в{' '}
          <Link to={`/journal/projects/${id}/fields`} className="text-indigo-500 hover:underline">
            конструкторе полей
          </Link>
          .
        </p>
      )}

      {/* Заказы — только если у проекта есть поля заказа (scope=order). В проектах,
          где все поля на карточке (Мазаль/Репат/Ника), блок не показываем. */}
      {orderFields.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              📦 Заказы{orders.length > 0 ? ` · ${orders.length}` : ''}
            </h3>
            <button
              onClick={() => void addOrder()}
              disabled={addingOrder}
              className="text-sm px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors disabled:opacity-50"
            >
              + Заказ
            </button>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-400">Заказов пока нет.</p>
          ) : (
            <ul className="space-y-2">
              {orders.map((r) => (
                <JournalRecordCard
                  key={r.id}
                  record={r}
                  fields={orderFields}
                  today={today}
                  purposes={orderPurposes}
                  defaultOpen={r.id === newOrder}
                  onSave={saveOrder}
                  onRecordRemove={removeOrder}
                  emptyTitle="Новый заказ"
                  removeLabel="Удалить заказ"
                  removeConfirm="Удалить этот заказ?"
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Комментарии */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          💬 Комментарии{comments.length > 0 ? ` · ${comments.length}` : ''}
        </h3>
        {comments.length > 0 && (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-4 py-2.5"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {nameOf(c.author_profile_id)}
                    <span className="ml-2 font-normal text-slate-400">{fmtDateTime(c.created_at)}</span>
                  </span>
                  {profile && c.author_profile_id === profile.id && (
                    <button
                      onClick={async () => {
                        if (confirm('Удалить комментарий?')) await removeComment(c.id)
                      }}
                      className="text-slate-300 hover:text-rose-500 text-sm"
                      aria-label="Удалить комментарий"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void sendComment()
              }
            }}
            rows={2}
            placeholder="Написать комментарий… (⌘/Ctrl+Enter — отправить)"
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => void sendComment()}
            disabled={!draft.trim()}
            className="self-end px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      </section>

      {/* Удаление клиента */}
      <div className="pt-2">
        <button onClick={() => void onDeleteClient()} className="text-sm text-rose-500 hover:text-rose-600">
          Удалить клиента
        </button>
      </div>
    </div>
  )
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

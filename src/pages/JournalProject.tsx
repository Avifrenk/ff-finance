import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects } from '../hooks/useWjProjects'
import { useWjFields, type WjField } from '../hooks/useWjFields'
import { useWjRecords, type WjRecord } from '../hooks/useWjRecords'
import { formatMoney } from '../lib/format'
import {
  getChoices,
  getCurrencies,
  parseMoney,
  parseChecklist,
  parseDate,
  parseTextValues,
  serializeTextValues,
  recordSummary,
  collectPurposes,
  todayLocalISO,
  type WjChecklistItem,
  type WjMoney,
} from '../lib/wjValues'

// Карточка проекта (/journal/projects/:id). Фаза 6b: список записей, добавление по
// текущей схеме полей, инлайн-правка значений по типу, сводка в строке (статус,
// прогресс чеклиста, срок с подсветкой просрочки). Аналитика — Фаза 7.
export function JournalProject() {
  const { id } = useParams<{ id: string }>()
  const { household } = useApp()
  const { projects, loading: pLoading } = useWjProjects({ includeArchived: true })
  const { fields, loading: fLoading } = useWjFields(id)
  const { records, loading: rLoading, create, replaceValues, remove } = useWjRecords(id)

  const today = todayLocalISO()
  const [newlyAdded, setNewlyAdded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const purposes = useMemo(() => collectPurposes(records, fields), [records, fields])

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

  async function addRecord() {
    if (adding) return
    setAdding(true)
    try {
      const rec = await create({})
      setNewlyAdded(rec.id) // авто-раскрыть новую запись для заполнения
    } finally {
      setAdding(false)
    }
  }

  const hasFields = fields.length > 0
  const isEmpty = !rLoading && records.length === 0

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
            {!rLoading && records.length > 0 ? ` · записей: ${records.length}` : ''}
          </p>
        </div>
      </header>

      {/* Нет полей — сперва настроить схему */}
      {!fLoading && !hasFields ? (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">🧱</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Сначала настройте поля проекта — из них собираются записи (имя клиента, сумма,
            статус и т.п.).
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Записи — клиенты и заказы по проекту.
            </p>
            {hasFields && records.length > 0 && (
              <button
                onClick={() => void addRecord()}
                disabled={adding}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors disabled:opacity-50"
              >
                + Запись
              </button>
            )}
          </div>

          {rLoading && records.length === 0 && (
            <p className="text-sm text-slate-400">Загрузка…</p>
          )}

          {isEmpty && hasFields && (
            <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
              <div className="text-4xl mb-2">🗂</div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Записей пока нет. Добавьте первого клиента или заказ.
              </p>
              <button
                onClick={() => void addRecord()}
                disabled={adding}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                + Добавить запись
              </button>
            </section>
          )}

          {records.length > 0 && (
            <ul className="space-y-2">
              {records.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  fields={fields}
                  today={today}
                  purposes={purposes}
                  defaultOpen={r.id === newlyAdded}
                  onSave={replaceValues}
                  onRecordRemove={remove}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ── Карточка одной записи ────────────────────────────────────────────────────
function RecordCard({
  record,
  fields,
  today,
  purposes,
  defaultOpen,
  onSave,
  onRecordRemove,
}: {
  record: WjRecord
  fields: WjField[]
  today: string
  purposes: string[]
  defaultOpen: boolean
  onSave: (id: string, values: Record<string, unknown>) => Promise<unknown>
  onRecordRemove: (id: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [values, setValues] = useState<Record<string, unknown>>(record.values)

  // Записать одно значение (undefined = очистить ключ) и сохранить целиком.
  const setVal = useCallback(
    (key: string, value: unknown) => {
      const next = { ...values }
      if (value === undefined) delete next[key]
      else next[key] = value
      setValues(next)
      void onSave(record.id, next)
    },
    [values, onSave, record.id],
  )

  const summary = recordSummary(values, fields, today)

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
      {/* Свёрнутая строка-сводка */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-slate-900 dark:text-slate-100 font-medium">
            {summary.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {summary.status && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-slate-700 dark:text-slate-200"
                style={{ background: summary.status.color ?? '#e2e8f0' }}
              >
                {summary.status.value}
              </span>
            )}
            {summary.checklist && (
              <span className="text-slate-500 dark:text-slate-400">
                ✅ {summary.checklist.done}/{summary.checklist.total}
              </span>
            )}
            {summary.due && (
              <span className={summary.due.overdue ? 'text-rose-500 font-medium' : 'text-slate-400'}>
                ⏳ {fmtDate(summary.due.date)}
                {summary.due.overdue ? ' · просрочено' : ''}
              </span>
            )}
            {summary.money.map((m, i) => (
              <span key={i} className="text-emerald-600 dark:text-emerald-400">
                {formatMoney(m.amount, m.currency, 0)}
              </span>
            ))}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {/* Развёрнутый редактор всех полей */}
      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 space-y-4">
          {fields.map((f) => (
            <div key={f.id}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                {f.label}
                {f.is_required && <span className="text-rose-400 ml-0.5">*</span>}
              </label>
              <FieldValueEditor
                field={f}
                value={values[f.key]}
                purposes={purposes}
                onChange={(v) => setVal(f.key, v)}
              />
            </div>
          ))}

          <div className="flex justify-end pt-1">
            <button
              onClick={async () => {
                if (confirm('Удалить эту запись?')) await onRecordRemove(record.id)
              }}
              className="text-sm text-rose-500 hover:text-rose-600"
            >
              Удалить запись
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Редактор значения по типу поля ───────────────────────────────────────────
const inputCls =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

function FieldValueEditor({
  field,
  value,
  purposes,
  onChange,
}: {
  field: WjField
  value: unknown
  purposes: string[]
  onChange: (v: unknown) => void
}) {
  switch (field.type) {
    case 'number':
      return (
        <input
          type="number"
          inputMode="decimal"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(e) => {
            const n = e.target.value.trim()
            onChange(n === '' ? undefined : Number(n))
          }}
          className={inputCls}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          value={parseDate(value) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputCls}
        />
      )
    case 'phone':
      return (
        <input
          type="tel"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => onChange(e.target.value.trim() || undefined)}
          placeholder="+972…"
          className={inputCls}
        />
      )
    case 'link':
      return (
        <input
          type="url"
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => onChange(e.target.value.trim() || undefined)}
          placeholder="https://…"
          className={inputCls}
        />
      )
    case 'note':
      return (
        <textarea
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => onChange(e.target.value.trim() || undefined)}
          rows={3}
          className={inputCls}
        />
      )
    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputCls}
        >
          <option value="">— не выбрано —</option>
          {getChoices(field).map((c) => (
            <option key={c.value} value={c.value}>
              {c.value}
            </option>
          ))}
        </select>
      )
    case 'status':
      return <StatusEditor field={field} value={value} onChange={onChange} />
    case 'money':
      return <MoneyEditor field={field} value={value} purposes={purposes} onChange={onChange} />
    case 'checklist':
      return <ChecklistEditor value={value} onChange={onChange} />
    case 'text':
    default:
      return <TextChipsEditor value={value} onChange={onChange} />
  }
}

// Статус — кликабельные чипы-воронка (цвет из choices).
function StatusEditor({
  field,
  value,
  onChange,
}: {
  field: WjField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const current = typeof value === 'string' ? value : ''
  return (
    <div className="flex flex-wrap gap-1.5">
      {getChoices(field).map((c) => {
        const active = c.value === current
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(active ? undefined : c.value)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              active
                ? 'border-transparent text-slate-800 dark:text-slate-900 font-medium'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
            style={active ? { background: c.color ?? '#e2e8f0' } : undefined}
          >
            {c.value}
          </button>
        )
      })}
    </div>
  )
}

// Деньги — сумма + валюта + (для expense) «на что» с автоподсказкой.
function MoneyEditor({
  field,
  value,
  purposes,
  onChange,
}: {
  field: WjField
  value: unknown
  purposes: string[]
  onChange: (v: unknown) => void
}) {
  const currencies = getCurrencies(field)
  const m = parseMoney(value)
  const isExpense = field.money_direction === 'expense'
  const listId = `purpose-${field.id}`

  // Собрать значение из частей; пусто (нет суммы) → очистить.
  const emit = (amount: string, currency: string, purpose: string) => {
    const n = amount.trim()
    if (n === '') {
      onChange(undefined)
      return
    }
    const next: WjMoney = { amount: Number(n), currency }
    const p = purpose.trim()
    if (p) next.purpose = p
    onChange(next)
  }

  const amount = m ? String(m.amount) : ''
  const currency = m?.currency ?? currencies[0]
  const purpose = m?.purpose ?? ''
  const needPurpose = isExpense && amount !== '' && purpose === ''

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          defaultValue={amount}
          key={`a-${currency}`}
          onBlur={(e) => emit(e.target.value, currency, purpose)}
          placeholder="0"
          className={`${inputCls} flex-1`}
        />
        {currencies.length > 1 ? (
          <select
            value={currency}
            onChange={(e) => emit(amount, e.target.value, purpose)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex items-center px-2 text-sm text-slate-400">{currency}</span>
        )}
      </div>
      {isExpense && (
        <>
          <input
            type="text"
            defaultValue={purpose}
            key={`p-${value ? 'v' : 'e'}`}
            list={listId}
            onBlur={(e) => emit(amount, currency, e.target.value)}
            placeholder="На что (обязательно для расхода)"
            className={`${inputCls} ${needPurpose ? 'ring-2 ring-rose-400 border-rose-400' : ''}`}
          />
          <datalist id={listId}>
            {purposes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {needPurpose && (
            <p className="text-[11px] text-rose-500">Укажите назначение траты.</p>
          )}
        </>
      )}
    </div>
  )
}

// Чеклист — список [{text,done}]: чекбоксы, добавление, удаление.
function ChecklistEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items = parseChecklist(value)
  const [draft, setDraft] = useState('')

  const emit = (next: WjChecklistItem[]) => onChange(next.length ? next : undefined)

  const add = () => {
    const t = draft.trim()
    if (!t) return
    emit([...items, { text: t, done: false }])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={it.done}
                onChange={(e) =>
                  emit(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))
                }
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-500 focus:ring-emerald-500"
              />
              <span
                className={`flex-1 text-sm ${
                  it.done
                    ? 'text-slate-400 line-through'
                    : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {it.text}
              </span>
              <button
                type="button"
                onClick={() => emit(items.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-rose-500"
                aria-label="Убрать пункт"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Добавить пункт…"
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          +
        </button>
      </div>
    </div>
  )
}

// Текст — мультизначение (несколько артикулов): чипы + поле добавления.
function TextChipsEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (v: unknown) => void
}) {
  const values = parseTextValues(value)
  const [draft, setDraft] = useState('')

  const emit = (next: string[]) => onChange(serializeTextValues(next))
  const add = () => {
    const t = draft.trim()
    if (!t) return
    emit([...values, t])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-sm text-slate-700 dark:text-slate-200"
            >
              {v}
              <button
                type="button"
                onClick={() => emit(values.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-rose-500"
                aria-label="Убрать"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={() => add()}
        placeholder={values.length ? 'Добавить ещё…' : 'Значение…'}
        className={inputCls}
      />
    </div>
  )
}

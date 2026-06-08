import { useState } from 'react'
import type { WjField } from '../hooks/useWjFields'
import {
  getChoices,
  getCurrencies,
  parseMoney,
  parseChecklist,
  parseDate,
  parseTextValues,
  serializeTextValues,
  type WjChecklistItem,
  type WjMoney,
} from '../lib/wjValues'
import { inputCls } from '../lib/journalUi'

// Редакторы значений записи по типу поля. Вынесены из JournalProject, чтобы
// переиспользовать и в карточке клиента (client-поля), и в заказах (order-поля).

export function FieldValueEditor({
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
          {needPurpose && <p className="text-[11px] text-rose-500">Укажите назначение траты.</p>}
        </>
      )}
    </div>
  )
}

// Чеклист — список [{text,done}]: чекбоксы, добавление, удаление.
function ChecklistEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
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
                  it.done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'
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
function TextChipsEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
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

import { useState } from 'react'
import type { WjField } from '../hooks/useWjFields'
import {
  getChoices,
  getCurrencies,
  parseMoney,
  parseMoneyList,
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
    case 'date': {
      // На iOS у нативного date-input нет кнопки очистки — даём свою.
      const dv = parseDate(value) ?? ''
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dv}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputCls}
          />
          {dv && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="shrink-0 text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Очистить дату"
            >
              Очистить
            </button>
          )}
        </div>
      )
    }
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

// Деньги. Доход — одна сумма + валюта. Расход — СПИСОК строк «на что + сумма»
// (несколько позиций: «Ира очереди 150$», «Миша сопровождение 100$»).
function MoneyEditor(props: {
  field: WjField
  value: unknown
  purposes: string[]
  onChange: (v: unknown) => void
}) {
  if (props.field.money_direction === 'expense') return <ExpenseListEditor {...props} />
  return <IncomeMoneyEditor {...props} />
}

// Доход — одиночная сумма + валюта.
function IncomeMoneyEditor({
  field,
  value,
  onChange,
}: {
  field: WjField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const currencies = getCurrencies(field)
  const m = parseMoney(value)

  const emit = (amount: string, currency: string) => {
    const n = amount.trim()
    if (n === '') {
      onChange(undefined)
      return
    }
    onChange({ amount: Number(n), currency } satisfies WjMoney)
  }

  const amount = m ? String(m.amount) : ''
  const currency = m?.currency ?? currencies[0]

  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="decimal"
        defaultValue={amount}
        key={`a-${currency}`}
        onBlur={(e) => emit(e.target.value, currency)}
        placeholder="0"
        className={`${inputCls} flex-1`}
      />
      {currencies.length > 1 ? (
        <select
          value={currency}
          onChange={(e) => emit(amount, e.target.value)}
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
  )
}

interface ExpRow {
  purpose: string
  amount: string
  currency: string
}

// Расход — список строк. Каждая строка: «на что» (текст, с автоподсказкой) +
// сумма + валюта. Можно добавлять/убирать строки.
function ExpenseListEditor({
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
  const listId = `purpose-${field.id}`

  const initial = (): ExpRow[] => {
    const parsed = parseMoneyList(value)
    const rows = parsed.map((m) => ({
      purpose: m.purpose ?? '',
      amount: String(m.amount),
      currency: m.currency,
    }))
    return rows.length ? rows : [{ purpose: '', amount: '', currency: currencies[0] }]
  }
  const [rows, setRows] = useState<ExpRow[]>(initial)

  // Собрать значение из строк: берём строки с числовой суммой; пусто → undefined.
  const commit = (next: ExpRow[]) => {
    const entries = next
      .map((r): WjMoney | null => {
        const a = r.amount.trim()
        if (a === '' || !Number.isFinite(Number(a))) return null
        const e: WjMoney = { amount: Number(a), currency: r.currency }
        const p = r.purpose.trim()
        if (p) e.purpose = p
        return e
      })
      .filter((e): e is WjMoney => e !== null)
    onChange(entries.length ? entries : undefined)
  }

  const patch = (i: number, p: Partial<ExpRow>, doCommit = false) => {
    setRows((prev) => {
      const next = prev.map((r, j) => (j === i ? { ...r, ...p } : r))
      if (doCommit) commit(next)
      return next
    })
  }

  const addRow = () =>
    setRows((prev) => [...prev, { purpose: '', amount: '', currency: currencies[0] }])

  const removeRow = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, j) => j !== i)
      const safe = next.length ? next : [{ purpose: '', amount: '', currency: currencies[0] }]
      commit(safe)
      return safe
    })

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1.5">
            <input
              type="text"
              value={r.purpose}
              list={listId}
              onChange={(e) => patch(i, { purpose: e.target.value })}
              onBlur={() => commit(rows)}
              placeholder="На что (напр. Ира очереди)"
              className={inputCls}
            />
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => patch(i, { amount: e.target.value })}
                onBlur={() => commit(rows)}
                placeholder="0"
                className={`${inputCls} flex-1`}
              />
              {currencies.length > 1 ? (
                <select
                  value={r.currency}
                  onChange={(e) => patch(i, { currency: e.target.value }, true)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="flex items-center px-2 text-sm text-slate-400">{r.currency}</span>
              )}
            </div>
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-2 text-slate-400 hover:text-rose-500"
              aria-label="Убрать строку"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <datalist id={listId}>
        {purposes.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={addRow}
        className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        + строка расхода
      </button>
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

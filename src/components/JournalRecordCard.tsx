import { useCallback, useState } from 'react'
import type { WjField } from '../hooks/useWjFields'
import type { WjRecord } from '../hooks/useWjRecords'
import { recordSummary } from '../lib/wjValues'
import { formatMoney } from '../lib/format'
import { FieldValueEditor } from './JournalFieldEditors'
import { fmtDate } from '../lib/journalUi'

// Карточка одной записи/заказа: свёрнутая строка-сводка + развёрнутый редактор
// всех полей. Используется и в проекте (legacy-записи), и в карточке клиента
// (заказы клиента). Поля передаёт вызывающий — обычно order-scope.
export function JournalRecordCard({
  record,
  fields,
  today,
  purposes,
  defaultOpen,
  onSave,
  onRecordRemove,
  emptyTitle = 'Без имени',
  removeLabel = 'Удалить запись',
  removeConfirm = 'Удалить эту запись?',
}: {
  record: WjRecord
  fields: WjField[]
  today: string
  purposes: string[]
  defaultOpen: boolean
  onSave: (id: string, values: Record<string, unknown>) => Promise<unknown>
  onRecordRemove: (id: string) => Promise<unknown>
  emptyTitle?: string
  removeLabel?: string
  removeConfirm?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [values, setValues] = useState<Record<string, unknown>>(record.values)

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
  const title = summary.title === 'Без имени' ? emptyTitle : summary.title

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-slate-900 dark:text-slate-100 font-medium">
            {title}
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
                if (confirm(removeConfirm)) await onRecordRemove(record.id)
              }}
              className="text-sm text-rose-500 hover:text-rose-600"
            >
              {removeLabel}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

import type { Operation } from '../hooks/useOperations'
import { formatDate, formatMoney } from '../lib/format'

export type ActionsSheetTarget =
  | { kind: 'op'; op: Operation; accountName: string; accountCurrency: string; categoryName: string | null; categoryIcon: string | null }
  | { kind: 'transfer'; transferId: string; date: string; from: { name: string; currency: string; amount: number }; to: { name: string; currency: string; amount: number }; note: string | null }

export function OperationActionsSheet({
  target,
  canModify,
  onClose,
  onEdit,
  onDelete,
}: {
  target: ActionsSheetTarget | null
  canModify: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  if (!target) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {target.kind === 'transfer' ? 'Перевод' : 'Операция'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {target.kind === 'op' ? (
          <div className="space-y-2 mb-5">
            <Row label="Сумма">
              <span
                className={
                  target.op.kind === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-900 dark:text-slate-100 font-semibold'
                }
              >
                {target.op.kind === 'expense' ? '−' : '+'}
                {formatMoney(Number(target.op.amount), target.accountCurrency).replace('−', '')}
              </span>
            </Row>
            <Row label="Дата">{formatDate(target.op.occurred_at)}</Row>
            <Row label="Счёт">{target.accountName}</Row>
            <Row label="Категория">
              {target.categoryName ? `${target.categoryIcon ? target.categoryIcon + ' ' : ''}${target.categoryName}` : '—'}
            </Row>
            {target.op.note && <Row label="Заметка">{target.op.note}</Row>}
            {target.op.is_private && <Row label="Приватность">🔒 Приватная</Row>}
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            <Row label="Дата">{formatDate(target.date)}</Row>
            <Row label="Откуда">
              {target.from.name} · {formatMoney(target.from.amount, target.from.currency)}
            </Row>
            <Row label="Куда">
              {target.to.name} · {formatMoney(target.to.amount, target.to.currency)}
            </Row>
            {target.note && <Row label="Заметка">{target.note}</Row>}
          </div>
        )}

        {canModify ? (
          <div className="space-y-2">
            {target.kind === 'op' && (
              <button
                onClick={onEdit}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
              >
                Изменить
              </button>
            )}
            <button
              onClick={onDelete}
              className="w-full py-2.5 rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-sm font-medium"
            >
              Удалить
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">
            Эту запись создал партнёр — изменить или удалить можно только из его аккаунта.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-900 dark:text-slate-100 text-right min-w-0 truncate">{children}</div>
    </div>
  )
}

import { type DashboardPeriod } from '../lib/period'

const LABELS: Record<DashboardPeriod, string> = {
  month: 'Этот месяц',
  'prev-month': 'Прошлый',
  '30days': '30 дней',
  quarter: 'Квартал',
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: DashboardPeriod
  onChange: (p: DashboardPeriod) => void
}) {
  const tabs: DashboardPeriod[] = ['month', 'prev-month', '30days', 'quarter']
  return (
    <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${
            value === t
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  )
}

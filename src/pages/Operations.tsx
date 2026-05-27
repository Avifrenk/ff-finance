import { useApp } from '../contexts/useApp'

export function Operations() {
  const { viewMode, household, profile } = useApp()
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {viewMode === 'personal' ? '🧍 Личные операции' : '🏠 Семейные операции'}
      </div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : household?.name}
      </h1>
      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500 dark:text-slate-400">
        Журнал операций появится в Фазе 2. Здесь будет CRUD добавления трат и доходов, выбор счёта,
        категории и (для семейного счёта) флаг «приватная операция».
      </div>
    </div>
  )
}

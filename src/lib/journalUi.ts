// Мелкие UI-хелперы задачника, общие для редакторов значений и карточек.
// Вынесены из компонентных файлов, чтобы не ломать react-refresh
// (файл с компонентами должен экспортировать только компоненты).

export const inputCls =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500'

// ISO-дата 'YYYY-MM-DD' → короткий русский формат «12 июн».
export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

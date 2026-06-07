import { Link, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjFields } from '../hooks/useWjFields'

// Конструктор полей (/journal/projects/:id/fields). Каркас Фазы 3: показывает
// текущие поля проекта. Добавление/типы/select-значения/money-направление и
// пресеты — Фаза 6. analytics_role пользователю не показываем (выводится из типа).
const TYPE_LABELS: Record<string, string> = {
  text: 'текст',
  number: 'число',
  money: 'деньги',
  date: 'дата',
  phone: 'телефон',
  link: 'ссылка',
  select: 'список',
  status: 'статус',
  checklist: 'чеклист',
  note: 'заметка',
}

export function JournalProjectFields() {
  const { id } = useParams<{ id: string }>()
  const { household } = useApp()
  const { fields, loading } = useWjFields(id)

  if (!household) return null

  return (
    <div className="space-y-4">
      <Link
        to={`/journal/projects/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        ← К проекту
      </Link>

      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Поля проекта
      </h2>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : fields.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <p className="text-3xl">🧱</p>
          <p className="text-slate-600 dark:text-slate-300 mt-2 font-medium">
            Полей пока нет
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Конструктор и стартовые пресеты — Фаза 6.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {fields.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 px-4 py-2.5"
            >
              <span className="text-slate-800 dark:text-slate-100">{f.label}</span>
              <span className="ml-auto text-xs rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-500 dark:text-slate-400">
                {TYPE_LABELS[f.type] ?? f.type}
                {f.money_direction ? ` · ${f.money_direction === 'income' ? 'доход' : 'расход'}` : ''}
              </span>
              {f.is_required && <span className="text-xs text-rose-400">обяз.</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Добавление полей, типы, select-значения, money-направление и пресеты — Фаза 6.
      </p>
    </div>
  )
}

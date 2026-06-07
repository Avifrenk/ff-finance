import { Link, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects } from '../hooks/useWjProjects'
import { useWjFields } from '../hooks/useWjFields'
import { useWjRecords } from '../hooks/useWjRecords'

// Карточка проекта (/journal/projects/:id). Каркас Фазы 3: показывает проект,
// число полей и записей. Список записей + инлайн-редактирование — Фаза 6,
// аналитика — Фаза 7.
export function JournalProject() {
  const { id } = useParams<{ id: string }>()
  const { household } = useApp()
  const { projects, loading: pLoading } = useWjProjects({ includeArchived: true })
  const { fields, loading: fLoading } = useWjFields(id)
  const { records, loading: rLoading } = useWjRecords(id)

  if (!household) return null

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

  return (
    <div className="space-y-5">
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
          ⚙️ Поля
        </Link>
      </div>

      <header className="flex items-center gap-3">
        <span
          className="h-11 w-11 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: project?.color ?? 'var(--color-slate-200, #e2e8f0)' }}
        >
          {project?.icon ?? '📁'}
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {project?.name ?? '…'}
          </h2>
          <p className="text-xs text-slate-400">
            {project?.visibility === 'shared' ? 'общий · виден обоим' : 'только я'}
            {project?.is_archived ? ' · в архиве' : ''}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Полей" value={fLoading ? '…' : fields.length} />
        <Stat label="Записей" value={rLoading ? '…' : records.length} />
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Список записей и инлайн-редактирование — Фаза 6; аналитика — Фаза 7.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 p-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
        {value}
      </p>
    </div>
  )
}

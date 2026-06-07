import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects, type WjProject } from '../hooks/useWjProjects'
import { JournalProjectDialog } from '../components/JournalProjectDialog'
import { PrimaryButton, SecondaryButton } from '../components/AuthControls'

// Под-таб «Проекты» (/journal/projects). Список личных + общих проектов в одном
// месте, создание/правка/архив; жёсткое удаление спрятано за подтверждением с
// вводом названия (каскадом тянет поля и записи). Конвенции — как Flights/Shopping.
export function JournalProjects() {
  const { household } = useApp()
  const { projects, loading, setArchived, remove } = useWjProjects({ includeArchived: true })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WjProject | null>(null)
  const [deleting, setDeleting] = useState<WjProject | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)

  const [active, archived] = useMemo(() => {
    const a: WjProject[] = []
    const z: WjProject[] = []
    for (const p of projects) (p.is_archived ? z : a).push(p)
    return [a, z]
  }, [projects])

  if (!household) return null

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(p: WjProject) {
    setEditing(p)
    setDialogOpen(true)
  }

  const isEmpty = !loading && active.length === 0 && archived.length === 0
  const onlyArchived = !loading && active.length === 0 && archived.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Проекты — отдельный учёт по каждому делу: клиенты, суммы, статусы.
        </p>
        {(active.length > 0 || onlyArchived) && (
          <PrimaryButton onClick={openCreate}>+ Проект</PrimaryButton>
        )}
      </div>

      {loading && projects.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
      )}

      {/* Совсем пусто — крупное приглашение создать первый проект */}
      {isEmpty && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">🗂</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Пока ни одного проекта. Создайте первый — например, «Аренда платьев» или
            «Репатриация», и ведите по нему клиентов, суммы и статусы.
          </p>
          <div className="inline-block">
            <PrimaryButton onClick={openCreate}>+ Создать проект</PrimaryButton>
          </div>
        </section>
      )}

      {/* Есть только архивные — отдельная подсказка, активный список пуст */}
      {onlyArchived && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Активных проектов нет — всё в архиве. Создайте новый или верните проект из
            архива ниже.
          </p>
        </section>
      )}

      {/* Активные проекты */}
      {active.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={() => openEdit(p)}
              onArchive={() => void setArchived(p.id, true)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </ul>
      )}

      {/* Архив — свёрнутым блоком внизу, как в Flights */}
      {archived.length > 0 && (
        <details
          className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40"
          open={archiveOpen}
          onToggle={(e) => setArchiveOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Архив ({archived.length})
          </summary>
          <ul className="p-4 grid gap-2 sm:grid-cols-2 border-t border-slate-200 dark:border-slate-700">
            {archived.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                archived
                onEdit={() => openEdit(p)}
                onRestore={() => void setArchived(p.id, false)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </ul>
        </details>
      )}

      <JournalProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        project={editing ?? undefined}
      />
      {deleting && (
        <DeleteProjectDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({
  project: p,
  archived = false,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: WjProject
  archived?: boolean
  onEdit: () => void
  onArchive?: () => void
  onRestore?: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to={`/journal/projects/${p.id}`} className="flex items-center gap-3 min-w-0 flex-1">
          <span
            className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-lg"
            style={{ background: p.color ?? '#e2e8f0' }}
          >
            {p.icon ?? '📁'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-slate-900 dark:text-slate-100">{p.name}</span>
            <span className="block text-xs text-slate-400">
              {p.visibility === 'shared' ? '👥 виден обоим' : '🧍 только я'}
              {archived ? ' · в архиве' : ''}
            </span>
          </span>
        </Link>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Действия с проектом"
          className="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <span aria-hidden className="text-lg leading-none">⋯</span>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button
            onClick={() => {
              setMenuOpen(false)
              onEdit()
            }}
            className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            Изменить
          </button>
          {archived ? (
            <button
              onClick={() => {
                setMenuOpen(false)
                onRestore?.()
              }}
              className="text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              Вернуть из архива
            </button>
          ) : (
            <button
              onClick={() => {
                setMenuOpen(false)
                onArchive?.()
              }}
              className="text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400"
            >
              Архивировать
            </button>
          )}
          <button
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
            className="ml-auto text-rose-500 hover:text-rose-600"
          >
            Удалить навсегда
          </button>
        </div>
      )}
    </li>
  )
}

// Жёсткое удаление спрятано за подтверждением: нужно вручную ввести название
// проекта. Каскадом удалятся все поля и записи — неайтишник не ждёт потери всех
// клиентов, поэтому ставим барьер (находка UX, Фаза 5).
function DeleteProjectDialog({
  project,
  onClose,
  onConfirm,
}: {
  project: WjProject
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const match = value.trim() === project.name.trim()

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-rose-600 dark:text-rose-400 mb-2">
          Удалить проект навсегда
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Вместе с проектом «{project.name}» удалятся <b>все его поля и записи</b> (клиенты,
          суммы, статусы). Это нельзя отменить. Если хотите просто убрать с глаз — лучше{' '}
          <b>архивируйте</b>.
        </p>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Введите название проекта, чтобы подтвердить
        </label>
        <input
          type="text"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          placeholder={project.name}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
        />

        <div className="flex gap-2 pt-5">
          <SecondaryButton type="button" onClick={onClose}>
            Отмена
          </SecondaryButton>
          <button
            type="button"
            disabled={!match || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white text-sm font-medium disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Удаляем…' : 'Удалить навсегда'}
          </button>
        </div>
      </div>
    </div>
  )
}

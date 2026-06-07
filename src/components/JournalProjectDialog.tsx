import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../contexts/useApp'
import { useWjProjects, type WjProject } from '../hooks/useWjProjects'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  /** Если задан — режим редактирования; иначе создание нового проекта. */
  project?: WjProject
}

// Пресеты под рабочие проекты (платья/репатриация/услуги), а не финансовые цели.
const ICON_OPTIONS = ['📁', '🗂', '👗', '🧳', '💼', '🏠', '💍', '🎓', '📦', '🧾', '💰', '📋', '🛟', '🎀']

// Пастельные фоны под иконку — спокойные, читаемые в обеих темах.
const COLOR_OPTIONS = [
  '#e0e7ff', // indigo
  '#fce7f3', // pink
  '#dcfce7', // green
  '#fef9c3', // yellow
  '#ffedd5', // orange
  '#e0f2fe', // sky
  '#f3e8ff', // purple
  '#fee2e2', // rose
  '#e2e8f0', // slate
]

const DEFAULT_ICON = '📁'
const DEFAULT_COLOR = '#e0e7ff'

export function JournalProjectDialog({ open, onClose, project }: Props) {
  const isEdit = !!project
  const { create, update } = useWjProjects({ includeArchived: true })
  const { members, profile } = useApp()
  // Имя супруга для подписи «Общий — видит {имя}»: член household, отличный от
  // текущего профиля (как личное/семейное в ViewModeSwitcher). Нет партнёра — null.
  const spouseName =
    members.find((m) => m.profile_id !== profile?.id)?.display_name?.trim() || null

  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string>(DEFAULT_ICON)
  const [color, setColor] = useState<string>(DEFAULT_COLOR)
  const [visibility, setVisibility] = useState<'personal' | 'shared'>('personal')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии: подтягиваем поля из проекта (edit) или сбрасываем
     в дефолт (create). Тот же паттерн, что в GoalDialog/AddOperationDialog. */
  useEffect(() => {
    if (!open) return
    if (project) {
      setName(project.name)
      setIcon(project.icon ?? DEFAULT_ICON)
      setColor(project.color ?? DEFAULT_COLOR)
      setVisibility(project.visibility)
    } else {
      setName('')
      setIcon(DEFAULT_ICON)
      setColor(DEFAULT_COLOR)
      setVisibility('personal')
    }
    setError(null)
  }, [open, project])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Введите название проекта')
      return
    }
    setBusy(true)
    try {
      if (isEdit && project) {
        await update(project.id, { name: trimmed, icon, color, visibility })
      } else {
        await create({ name: trimmed, icon, color, visibility })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? 'Изменить проект' : 'Новый проект'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Живой предпросмотр карточки */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-3">
            <span
              className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: color }}
            >
              {icon}
            </span>
            <span className="min-w-0 text-slate-900 dark:text-slate-100 truncate">
              {name.trim() || 'Название проекта'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Название
            </label>
            <AuthInput
              type="text"
              placeholder="Например: Аренда платьев"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Иконка
            </label>
            <div className="grid grid-cols-7 gap-1">
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`aspect-square rounded-lg text-xl transition-colors ${
                    icon === emoji
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-2 ring-indigo-500'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Цвет
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Цвет ${hex}`}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    color === hex
                      ? 'ring-2 ring-offset-2 ring-indigo-500 ring-offset-white dark:ring-offset-slate-900 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Кто видит проект
            </label>
            <div className="grid grid-cols-2 gap-2">
              <VisibilityOption
                active={visibility === 'personal'}
                onClick={() => setVisibility('personal')}
                emoji="🧍"
                title="Только я"
                description="Видите только вы"
              />
              <VisibilityOption
                active={visibility === 'shared'}
                onClick={() => setVisibility('shared')}
                emoji="👥"
                title="Общий"
                description={spouseName ? `Видит ${spouseName}` : 'Увидит партнёр'}
              />
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать проект'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

function VisibilityOption({
  active,
  onClick,
  emoji,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  emoji: string
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-lg border text-left transition-colors ${
        active
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
      }`}
    >
      <div className="text-xl mb-1">{emoji}</div>
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>
    </button>
  )
}

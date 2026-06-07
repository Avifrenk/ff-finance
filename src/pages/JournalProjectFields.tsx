import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useWjProjects } from '../hooks/useWjProjects'
import { useWjFields, type WjField } from '../hooks/useWjFields'
import { JournalFieldDialog } from '../components/JournalFieldDialog'
import { WJ_PRESETS, getChoices, getCurrencies, type WjPreset } from '../lib/wjValues'

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

// Конструктор полей (/journal/projects/:id/fields). Фаза 6a: стартовые пресеты на
// пустом экране, добавить/изменить/удалить/переупорядочить поле. analytics_role
// пользователю не показываем (выводится из типа; ручная правка — в «Дополнительно»).
export function JournalProjectFields() {
  const { id } = useParams<{ id: string }>()
  const { household } = useApp()
  const { projects } = useWjProjects({ includeArchived: true })
  const { fields, loading, create, remove, reorder } = useWjFields(id)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WjField | null>(null)
  const [seeding, setSeeding] = useState(false)

  if (!household || !id) return null

  const project = projects.find((p) => p.id === id)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(f: WjField) {
    setEditing(f)
    setDialogOpen(true)
  }

  // Сид пресета: создаём поля по порядку (sort_order = индекс).
  async function applyPreset(preset: WjPreset) {
    if (preset.fields.length === 0) {
      openCreate()
      return
    }
    setSeeding(true)
    try {
      for (let i = 0; i < preset.fields.length; i++) {
        await create({ ...preset.fields[i], sort_order: i })
      }
    } finally {
      setSeeding(false)
    }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const ids = fields.map((f) => f.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorder(ids)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <Link
          to={`/journal/projects/${id}`}
          className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← К проекту
        </Link>
        {fields.length > 0 && (
          <button
            onClick={openCreate}
            className="text-sm px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors"
          >
            + Поле
          </button>
        )}
      </div>

      <header>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Поля проекта{project ? ` · ${project.name}` : ''}
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Из этих полей собираются записи (карточки клиентов/заказов).
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-slate-400">Загрузка…</p>
      ) : fields.length === 0 ? (
        /* Пустой конструктор — стартовые пресеты «На что похоже?» */
        <section className="space-y-3">
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6">
            <p className="text-center text-3xl mb-1">🧱</p>
            <p className="text-center text-slate-700 dark:text-slate-200 font-medium">
              На что похож проект?
            </p>
            <p className="text-center text-sm text-slate-400 mb-4">
              Выберите заготовку — поля можно потом изменить и дополнить.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {WJ_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={seeding}
                  onClick={() => void applyPreset(preset)}
                  className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors disabled:opacity-50"
                >
                  <div className="text-2xl mb-1">{preset.emoji}</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {preset.title}
                  </div>
                  <div className="text-[11px] leading-tight text-slate-400 mt-0.5">
                    {preset.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <ul className="space-y-1.5">
          {fields.map((f, i) => (
            <li
              key={f.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex flex-col">
                  <button
                    onClick={() => void move(i, -1)}
                    disabled={i === 0}
                    aria-label="Выше"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 leading-none"
                  >
                    ▴
                  </button>
                  <button
                    onClick={() => void move(i, 1)}
                    disabled={i === fields.length - 1}
                    aria-label="Ниже"
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 leading-none"
                  >
                    ▾
                  </button>
                </span>

                <button
                  onClick={() => openEdit(f)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block truncate text-slate-800 dark:text-slate-100">
                    {f.label}
                    {f.is_required && <span className="text-rose-400 ml-1">*</span>}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {TYPE_LABELS[f.type] ?? f.type}
                    {f.money_direction
                      ? ` · ${f.money_direction === 'income' ? 'доход' : 'расход'} · ${getCurrencies(f).join('/')}`
                      : ''}
                    {(f.type === 'select' || f.type === 'status') &&
                      ` · ${getChoices(f).length} знач.`}
                  </span>
                </button>

                <button
                  onClick={() => openEdit(f)}
                  aria-label="Изменить поле"
                  className="shrink-0 p-1.5 text-slate-400 hover:text-indigo-500 transition-colors"
                >
                  ✏️
                </button>
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        `Удалить поле «${f.label}»? Его значения во всех записях будут потеряны.`,
                      )
                    )
                      await remove(f.id)
                  }}
                  aria-label="Удалить поле"
                  className="shrink-0 p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <JournalFieldDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          projectId={id}
          allFields={fields}
          field={editing ?? undefined}
        />
      )}
    </div>
  )
}

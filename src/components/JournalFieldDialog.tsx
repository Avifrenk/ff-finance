import { useEffect, useState, type FormEvent } from 'react'
import {
  useWjFields,
  type WjField,
  type WjFieldType,
  type WjMoneyDirection,
  type WjAnalyticsRole,
} from '../hooks/useWjFields'
import {
  BASE_CURRENCIES,
  getChoices,
  getCurrencies,
  slugify,
  deriveAnalyticsRole,
  type WjChoice,
} from '../lib/wjValues'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  /** Все поля проекта — для уникальности key и эвристики client_name. */
  allFields: WjField[]
  /** Задан — режим правки; иначе добавление нового поля. */
  field?: WjField
}

// Таксономия типов Ф1. Порядок — от частых к редким.
const TYPE_OPTIONS: { type: WjFieldType; label: string; hint: string }[] = [
  { type: 'text', label: 'Текст', hint: 'Имя, артикул (можно несколько)' },
  { type: 'money', label: 'Деньги', hint: 'Сумма с валютой, доход/расход' },
  { type: 'status', label: 'Статус', hint: 'Стадии-воронка: бронь → выдано' },
  { type: 'select', label: 'Список', hint: 'Выбор одного из значений' },
  { type: 'date', label: 'Дата', hint: 'Срок, дата возврата' },
  { type: 'checklist', label: 'Чеклист', hint: 'Подзадачи [ ]/[x]' },
  { type: 'phone', label: 'Телефон', hint: 'Кликабельный номер' },
  { type: 'link', label: 'Ссылка', hint: 'Кликабельный URL' },
  { type: 'number', label: 'Число', hint: 'Количество и т.п.' },
  { type: 'note', label: 'Заметка', hint: 'Длинный текст' },
]

const ROLE_LABELS: Record<WjAnalyticsRole, string> = {
  amount: 'сумма (доход/расход)',
  date_payment: 'дата платежа',
  date_due: 'срок (план/факт)',
  status: 'статус-воронка',
  client_name: 'имя клиента',
}

// Палитра для значений статуса/списка — те же пастельные, что у проектов.
const CHOICE_COLORS = ['#e0f2fe', '#dcfce7', '#fef9c3', '#ffedd5', '#fee2e2', '#f3e8ff', '#e2e8f0']

type RoleMode = 'auto' | 'none' | WjAnalyticsRole

export function JournalFieldDialog({ open, onClose, projectId, allFields, field }: Props) {
  const isEdit = !!field
  const { create, update } = useWjFields(projectId)

  const [label, setLabel] = useState('')
  const [type, setType] = useState<WjFieldType>('text')
  const [required, setRequired] = useState(false)
  const [choices, setChoices] = useState<WjChoice[]>([])
  const [choiceDraft, setChoiceDraft] = useState('')
  const [currencies, setCurrencies] = useState<string[]>(['ILS'])
  const [direction, setDirection] = useState<WjMoneyDirection>('income')
  const [roleMode, setRoleMode] = useState<RoleMode>('auto')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии (паттерн JournalProjectDialog/GoalDialog). */
  useEffect(() => {
    if (!open) return
    if (field) {
      setLabel(field.label)
      setType(field.type)
      setRequired(field.is_required)
      setChoices(getChoices(field))
      setCurrencies(getCurrencies(field))
      setDirection(field.money_direction ?? 'income')
      setRoleMode(field.analytics_role ?? 'none')
    } else {
      setLabel('')
      setType('text')
      setRequired(false)
      setChoices([])
      setCurrencies(['ILS'])
      setDirection('income')
      setRoleMode('auto')
    }
    setChoiceDraft('')
    setError(null)
  }, [open, field])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  const needsChoices = type === 'select' || type === 'status'
  const isMoney = type === 'money'

  function addChoice() {
    const v = choiceDraft.trim()
    if (!v) return
    if (choices.some((c) => c.value === v)) {
      setChoiceDraft('')
      return
    }
    setChoices((prev) => [...prev, { value: v, color: CHOICE_COLORS[prev.length % CHOICE_COLORS.length] }])
    setChoiceDraft('')
  }
  function moveChoice(i: number, dir: -1 | 1) {
    setChoices((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function toggleCurrency(code: string) {
    setCurrencies((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = label.trim()
    if (!trimmed) {
      setError('Введите название поля')
      return
    }
    if (needsChoices && choices.length === 0) {
      setError('Добавьте хотя бы одно значение')
      return
    }
    if (isMoney && currencies.length === 0) {
      setError('Выберите хотя бы одну валюту')
      return
    }

    const options = needsChoices
      ? { choices }
      : isMoney
        ? { currencies }
        : null

    // analytics_role: авто = эвристика из типа; иначе явный выбор / нет.
    const analytics_role: WjAnalyticsRole | null =
      roleMode === 'auto'
        ? deriveAnalyticsRole(type, allFields, field?.id)
        : roleMode === 'none'
          ? null
          : roleMode

    setBusy(true)
    try {
      if (isEdit && field) {
        await update(field.id, {
          label: trimmed,
          type,
          is_required: required,
          options,
          money_direction: isMoney ? direction : null,
          analytics_role,
        })
      } else {
        const existingKeys = allFields.map((f) => f.key)
        await create({
          key: slugify(trimmed, existingKeys),
          label: trimmed,
          type,
          is_required: required,
          options,
          money_direction: isMoney ? direction : null,
          analytics_role,
        })
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
            {isEdit ? 'Изменить поле' : 'Новое поле'}
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
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Название
            </label>
            <AuthInput
              type="text"
              placeholder="Например: Имя клиента"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Тип поля
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setType(t.type)}
                  className={`text-left p-2.5 rounded-lg border transition-colors ${
                    type === t.type
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t.label}
                  </div>
                  <div className="text-[11px] leading-tight text-slate-400">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* select/status — значения */}
          {needsChoices && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Значения {type === 'status' ? '(по порядку воронки)' : ''}
              </label>
              {choices.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {choices.map((c, i) => (
                    <li
                      key={c.value}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5"
                    >
                      <span className="flex gap-1">
                        {CHOICE_COLORS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Цвет ${hex}`}
                            onClick={() =>
                              setChoices((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, color: hex } : x)),
                              )
                            }
                            className={`h-4 w-4 rounded-full ${
                              c.color === hex ? 'ring-2 ring-offset-1 ring-indigo-500 dark:ring-offset-slate-900' : ''
                            }`}
                            style={{ background: hex }}
                          />
                        ))}
                      </span>
                      <span className="flex-1 text-sm text-slate-800 dark:text-slate-100 truncate">
                        {c.value}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveChoice(i, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                        aria-label="Выше"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChoice(i, 1)}
                        disabled={i === choices.length - 1}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                        aria-label="Ниже"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => setChoices((prev) => prev.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-rose-500"
                        aria-label="Удалить значение"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={choiceDraft}
                  onChange={(e) => setChoiceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addChoice()
                    }
                  }}
                  placeholder="Добавить значение…"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={addChoice}
                  className="px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Добавить
                </button>
              </div>
            </div>
          )}

          {/* money — валюты + направление */}
          {isMoney && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Валюты
                </label>
                <div className="flex flex-wrap gap-2">
                  {BASE_CURRENCIES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleCurrency(code)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                        currencies.includes(code)
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Это доход или расход?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('income')}
                    className={`p-2.5 rounded-lg border text-sm transition-colors ${
                      direction === 'income'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('expense')}
                    className={`p-2.5 rounded-lg border text-sm transition-colors ${
                      direction === 'expense'
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Расход
                  </button>
                </div>
                {direction === 'expense' && (
                  <p className="text-xs text-slate-400 mt-2">
                    У расхода нужно указывать «на что» — поле назначения появится прямо в записи.
                  </p>
                )}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-500 focus:ring-indigo-500"
            />
            Обязательное поле
          </label>

          {/* Дополнительно — ручная переразметка роли (обычно не нужна) */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-700">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Дополнительно
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-1">
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                Роль в аналитике
              </label>
              <select
                value={roleMode}
                onChange={(e) => setRoleMode(e.target.value as RoleMode)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="auto">Авто (по типу поля)</option>
                <option value="none">Не участвует</option>
                {(Object.keys(ROLE_LABELS) as WjAnalyticsRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Обычно оставляйте «Авто» — роль выводится из типа поля.
              </p>
            </div>
          </details>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Добавить поле'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

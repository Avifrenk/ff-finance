import { useEffect, useState, type FormEvent } from 'react'
import { useGoals, type Goal } from '../hooks/useGoals'
import { useApp } from '../contexts/useApp'
import { currencySymbol } from '../lib/format'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  /** Если задана — режим редактирования; иначе создание. */
  goal?: Goal
}

const ICON_OPTIONS = ['🎯', '🏖', '🏠', '💍', '🚗', '👶', '🎓', '💻', '🛟', '🪙']

export function GoalDialog({ open, onClose, goal }: Props) {
  const isEdit = !!goal
  const { create, update } = useGoals({ includeArchived: true })
  const { household } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [visibility, setVisibility] = useState<'personal' | 'shared'>('shared')
  const [autoMode, setAutoMode] = useState<'off' | 'percent' | 'amount'>('off')
  const [autoPercent, setAutoPercent] = useState('')
  const [autoAmount, setAutoAmount] = useState('')
  const [icon, setIcon] = useState<string>('🎯')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии диалога: подтягиваем поля из существующего goal
     или сбрасываем в дефолт. Это легитимный setState-in-effect, как в
     AddOperationDialog. */
  useEffect(() => {
    if (!open) return
    if (goal) {
      setName(goal.name)
      setTarget(String(goal.target_amount))
      setTargetDate(goal.target_date ?? '')
      setVisibility(goal.visibility)
      if (goal.auto_percent_of_income > 0) {
        setAutoMode('percent')
        setAutoPercent(String(goal.auto_percent_of_income))
        setAutoAmount('')
      } else if (goal.auto_amount_per_income > 0) {
        setAutoMode('amount')
        setAutoPercent('')
        setAutoAmount(String(goal.auto_amount_per_income))
      } else {
        setAutoMode('off')
        setAutoPercent('')
        setAutoAmount('')
      }
      setIcon(goal.icon ?? '🎯')
    } else {
      setName('')
      setTarget('')
      setTargetDate('')
      setVisibility('shared')
      setAutoMode('off')
      setAutoPercent('')
      setAutoAmount('')
      setIcon('🎯')
    }
    setError(null)
  }, [open, goal])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const targetNum = Number(target.replace(',', '.'))
    if (!isFinite(targetNum) || targetNum <= 0) {
      setError('Сумма должна быть положительным числом')
      return
    }
    if (!name.trim()) {
      setError('Дайте цели название')
      return
    }
    let autoPercentNum = 0
    let autoAmountNum = 0
    if (autoMode === 'percent') {
      autoPercentNum = Number(autoPercent.replace(',', '.'))
      if (!isFinite(autoPercentNum) || autoPercentNum <= 0 || autoPercentNum > 100) {
        setError('Процент должен быть от 0 до 100')
        return
      }
    } else if (autoMode === 'amount') {
      autoAmountNum = Number(autoAmount.replace(',', '.'))
      if (!isFinite(autoAmountNum) || autoAmountNum <= 0) {
        setError('Сумма должна быть положительной')
        return
      }
    }

    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        target_amount: targetNum,
        target_date: targetDate || null,
        visibility,
        auto_percent_of_income: autoPercentNum,
        auto_amount_per_income: autoAmountNum,
        icon,
      }
      if (isEdit && goal) {
        await update(goal.id, payload)
      } else {
        await create(payload)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
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
            {isEdit ? 'Изменить цель' : 'Новая цель'}
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
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Иконка
            </label>
            <div className="grid grid-cols-10 gap-1">
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
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Название
            </label>
            <AuthInput
              type="text"
              placeholder="Например: отпуск на Кипр"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Сколько хотим накопить
            </label>
            <AuthInput
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              className="text-2xl font-semibold text-center"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              К какой дате (необязательно)
            </label>
            <AuthInput
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Если оставить пустым — цель бессрочная (подушка, чёрный день).
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Видимость
            </label>
            <div className="grid grid-cols-2 gap-2">
              <VisibilityOption
                active={visibility === 'shared'}
                onClick={() => setVisibility('shared')}
                emoji="🏠"
                title="Семейная"
                description="Видят оба"
              />
              <VisibilityOption
                active={visibility === 'personal'}
                onClick={() => setVisibility('personal')}
                emoji="🧍"
                title="Личная"
                description="Видите только вы"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Авто-зачисление с дохода
            </label>
            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 mb-2">
              <AutoModeTab active={autoMode === 'off'} onClick={() => setAutoMode('off')}>
                Выключено
              </AutoModeTab>
              <AutoModeTab active={autoMode === 'percent'} onClick={() => setAutoMode('percent')}>
                % дохода
              </AutoModeTab>
              <AutoModeTab active={autoMode === 'amount'} onClick={() => setAutoMode('amount')}>
                Фикс. сумма
              </AutoModeTab>
            </div>

            {autoMode === 'percent' && (
              <>
                <AuthInput
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="decimal"
                  placeholder="10"
                  value={autoPercent}
                  onChange={(e) => setAutoPercent(e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  С каждой будущей зарплаты/дохода автоматически откладывается этот процент.
                </p>
              </>
            )}

            {autoMode === 'amount' && (
              <>
                <AuthInput
                  type="text"
                  inputMode="decimal"
                  placeholder={`например, 500 ${currencySymbol(baseCurrency)}`}
                  value={autoAmount}
                  onChange={(e) => setAutoAmount(e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Фиксированная сумма в {currencySymbol(baseCurrency)} {baseCurrency}, откладывается
                  с каждой income-операции (зарплата, перевод, бонус).
                </p>
              </>
            )}

            {autoMode === 'off' && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Авто-зачисление выключено — пополнять цель будете руками через «+ Пополнить».
              </p>
            )}
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать цель'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

function AutoModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 text-xs font-medium rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
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

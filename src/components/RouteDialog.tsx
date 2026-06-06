import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { CreateRouteInput } from '../hooks/useFlightRoutes'
import {
  looksLikeAirline,
  placeLabel,
  resolvePlace,
  todayISO,
} from '../lib/airports'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  /** chat_id создателя — кладётся в owner_chat_id маршрута. */
  ownerChatId: number
  onCreate: (input: CreateRouteInput) => Promise<void>
}

// Месяц для сравнения «не в прошлом»: 'YYYY-MM' текущего месяца.
function thisMonthISO(): string {
  return todayISO().slice(0, 7)
}

export function RouteDialog({ open, onClose, ownerChatId, onCreate }: Props) {
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')

  // Один переключатель режима для обеих дат: конкретные дни или целые месяцы.
  const [monthMode, setMonthMode] = useState(false)
  const [departDay, setDepartDay] = useState('')
  const [departMonth, setDepartMonth] = useState('')
  const [returnDay, setReturnDay] = useState('')
  const [returnMonth, setReturnMonth] = useState('')

  const [maxTransfers, setMaxTransfers] = useState<string>('') // '' = любые, '0'..'3'
  const [airlinesMode, setAirlinesMode] = useState<'off' | 'only' | 'except'>('off')
  const [airlinesText, setAirlinesText] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- сброс формы при открытии. */
  useEffect(() => {
    if (!open) return
    setOrigin('')
    setDestination('')
    setMonthMode(false)
    setDepartDay('')
    setDepartMonth('')
    setReturnDay('')
    setReturnMonth('')
    setMaxTransfers('')
    setAirlinesMode('off')
    setAirlinesText('')
    setError(null)
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Живой предпросмотр распознанных городов — чтобы было видно, что ввод понят.
  const originIata = useMemo(() => resolvePlace(origin), [origin])
  const destIata = useMemo(() => resolvePlace(destination), [destination])

  if (!open) return null

  function departValue(): string {
    return monthMode ? departMonth : departDay
  }
  function returnValue(): string {
    return monthMode ? returnMonth : returnDay
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!originIata) {
      setError('Не понял город отправления. Впишите код (TLV) или название (Тель-Авив).')
      return
    }
    if (!destIata) {
      setError('Не понял город назначения. Впишите код (JFK) или название (Нью-Йорк).')
      return
    }
    if (originIata === destIata) {
      setError('«Откуда» и «куда» совпали — проверьте города.')
      return
    }

    const depart = departValue()
    if (!depart) {
      setError(monthMode ? 'Укажите месяц вылета.' : 'Укажите дату вылета «Туда».')
      return
    }
    const today = todayISO()
    const departPast = monthMode ? depart < thisMonthISO() : depart < today
    if (departPast) {
      setError('Дата вылета уже прошла — выберите будущую.')
      return
    }

    // Обратная дата необязательна: пусто = билет в одну сторону.
    let returnDate: string | null = null
    const ret = returnValue()
    if (ret) {
      const retPast = monthMode ? ret < thisMonthISO() : ret < today
      if (retPast) {
        setError('Дата возврата уже прошла — выберите будущую.')
        return
      }
      if (ret < depart) {
        setError('Дата возврата раньше вылета — поменяйте их местами.')
        return
      }
      returnDate = ret
    }

    // Авиакомпании.
    let airlines: string | null = null
    let mode: 'only' | 'except' | null = null
    if (airlinesMode !== 'off') {
      const codes = airlinesText
        .split(/[\s,]+/)
        .map((c) => c.trim())
        .filter(Boolean)
      if (codes.length === 0) {
        setError('Укажите хотя бы один код авиакомпании (например, TK LH) или выберите «любые».')
        return
      }
      for (const c of codes) {
        if (!looksLikeAirline(c)) {
          setError(`Не похоже на код авиакомпании: «${c}». Коды — 2–3 латинские буквы/цифры (TK, LH, W4).`)
          return
        }
      }
      airlines = codes.map((c) => c.toUpperCase()).join(',')
      mode = airlinesMode
    }

    setBusy(true)
    try {
      await onCreate({
        origin: originIata,
        destination: destIata,
        depart_date: depart,
        return_date: returnDate,
        max_transfers: maxTransfers === '' ? null : Number(maxTransfers),
        airlines,
        airlines_mode: mode,
        owner_chat_id: ownerChatId,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать маршрут')
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
            Новый маршрут
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
          {/* Откуда / Куда */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Откуда
              </label>
              <AuthInput
                type="text"
                placeholder="TLV или Тель-Авив"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                autoFocus
                required
              />
              <PlaceHint raw={origin} iata={originIata} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Куда
              </label>
              <AuthInput
                type="text"
                placeholder="JFK или Нью-Йорк"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              />
              <PlaceHint raw={destination} iata={destIata} />
            </div>
          </div>

          {/* Даты: Туда (обязательно) и Обратно (пусто = в одну сторону) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Туда
              </label>
              {monthMode ? (
                <AuthInput
                  type="month"
                  min={thisMonthISO()}
                  value={departMonth}
                  onChange={(e) => setDepartMonth(e.target.value)}
                />
              ) : (
                <AuthInput
                  type="date"
                  min={todayISO()}
                  value={departDay}
                  onChange={(e) => setDepartDay(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Обратно
              </label>
              {monthMode ? (
                <AuthInput
                  type="month"
                  min={departMonth || thisMonthISO()}
                  value={returnMonth}
                  onChange={(e) => setReturnMonth(e.target.value)}
                />
              ) : (
                <AuthInput
                  type="date"
                  min={departDay || todayISO()}
                  value={returnDay}
                  onChange={(e) => setReturnDay(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="-mt-2 space-y-1.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              «Обратно» можно не заполнять — тогда ищем билет в одну сторону.
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={monthMode}
                onChange={(e) => setMonthMode(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
              />
              Точные даты неважны — искать по всему месяцу
            </label>
          </div>

          {/* Пересадки */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Пересадки
            </label>
            <select
              value={maxTransfers}
              onChange={(e) => setMaxTransfers(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
            >
              <option value="">Любые</option>
              <option value="0">Только прямые</option>
              <option value="1">Не больше 1 пересадки</option>
              <option value="2">Не больше 2 пересадок</option>
              <option value="3">Не больше 3 пересадок</option>
            </select>
          </div>

          {/* Авиакомпании */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Авиакомпании (необязательно)
            </label>
            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 mb-2">
              <ModeTab active={airlinesMode === 'off'} onClick={() => setAirlinesMode('off')}>
                Все
              </ModeTab>
              <ModeTab active={airlinesMode === 'only'} onClick={() => setAirlinesMode('only')}>
                Только эти
              </ModeTab>
              <ModeTab active={airlinesMode === 'except'} onClick={() => setAirlinesMode('except')}>
                Кроме этих
              </ModeTab>
            </div>
            {airlinesMode !== 'off' && (
              <>
                <AuthInput
                  type="text"
                  placeholder="TK LH (коды через пробел или запятую)"
                  value={airlinesText}
                  onChange={(e) => setAirlinesText(e.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Двух-трёхбуквенные коды авиакомпаний: TK — Turkish, LH — Lufthansa, W4 — Wizz.
                </p>
              </>
            )}
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Создаём…' : 'Отслеживать'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

function PlaceHint({ raw, iata }: { raw: string; iata: string | null }) {
  if (!raw.trim()) return null
  if (iata) {
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✓ {placeLabel(iata)}</p>
    )
  }
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">не распознали город</p>
  )
}

function ModeTab({
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

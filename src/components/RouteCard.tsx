import type { FlightRoute, RouteStats } from '../hooks/useFlightRoutes'
import { formatFlightDate, placeLabel } from '../lib/airports'
import { currencySymbol } from '../lib/format'

interface Props {
  route: FlightRoute
  stats: RouteStats | undefined
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}

function money(price: number, currency: string): string {
  const symbol = currencySymbol(currency.toUpperCase())
  return `${Math.round(price).toLocaleString('ru-RU')} ${symbol}`
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  return `${days} дн назад`
}

export function RouteCard({ route, stats, onArchive, onRestore, onDelete }: Props) {
  const archived = route.status === 'archived'
  const last = stats?.last ?? null
  const currency = last?.currency ?? 'RUB'

  // Тренд: текущая цена относительно средней по наблюдениям.
  let dropPct: number | null = null
  if (last && stats?.avg && stats.avg > 0) {
    dropPct = (stats.avg - last.price) / stats.avg
  }
  const isDeal = dropPct !== null && dropPct >= 0.2 // порог пуша бота — −20%

  return (
    <div
      className={`rounded-2xl border bg-white/70 dark:bg-slate-900/50 p-5 ${
        isDeal
          ? 'border-emerald-300 dark:border-emerald-800 ring-1 ring-emerald-200 dark:ring-emerald-900'
          : 'border-slate-200 dark:border-slate-700'
      } ${archived ? 'opacity-75' : ''}`}
    >
      {/* Маршрут + даты */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <span className="truncate">{placeLabel(route.origin)}</span>
            <span className="text-slate-400 shrink-0">→</span>
            <span className="truncate">{placeLabel(route.destination)}</span>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Туда: {formatFlightDate(route.depart_date)}
            {route.return_date ? (
              <> · Обратно: {formatFlightDate(route.return_date)}</>
            ) : (
              <> · в одну сторону</>
            )}
          </div>
        </div>
        {isDeal && (
          <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-2.5 py-1">
            −{Math.round(dropPct! * 100)}% 🔥
          </span>
        )}
      </div>

      {/* Фильтры */}
      {(route.max_transfers !== null || route.airlines) && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {route.max_transfers !== null && (
            <Chip>
              {route.max_transfers === 0 ? 'только прямые' : `≤ ${route.max_transfers} пересадок`}
            </Chip>
          )}
          {route.airlines && (
            <Chip>
              {route.airlines_mode === 'except' ? 'кроме ' : 'только '}
              {route.airlines.split(',').join(', ')}
            </Chip>
          )}
        </div>
      )}

      {/* Цена */}
      <div className="mt-4">
        {last ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {money(last.price, currency)}
              </span>
              {dropPct !== null && (
                <span
                  className={`text-sm font-medium ${
                    dropPct > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : dropPct < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-400'
                  }`}
                >
                  {dropPct > 0 ? '↓' : dropPct < 0 ? '↑' : '='}
                  {' '}
                  {Math.abs(Math.round(dropPct * 100))}% к средней
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {last.airline && <>рейс {last.airline} · </>}
              {last.transfers === 0 ? 'прямой' : `пересадок: ${last.transfers}`} ·{' '}
              обновлено {relativeTime(last.observed_at)}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Пока нет наблюдений — бот соберёт первые цены в ближайшие часы.
          </p>
        )}
      </div>

      {/* Мини-история */}
      {stats && stats.count > 1 && (
        <div className="mt-4 flex items-center gap-4">
          <Sparkline series={stats.series} />
          <div className="grid grid-cols-3 gap-x-4 text-xs">
            <Stat label="мин" value={money(stats.min!, currency)} accent="emerald" />
            <Stat label="средняя" value={money(stats.avg!, currency)} />
            <Stat label="макс" value={money(stats.max!, currency)} accent="rose" />
          </div>
        </div>
      )}

      {/* Действия */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm">
        {last?.link && (
          <a
            href={last.link}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
          >
            Открыть на Aviasales ↗
          </a>
        )}
        <div className="ml-auto flex items-center gap-3">
          {archived ? (
            <button
              onClick={onRestore}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Вернуть в активные
            </button>
          ) : (
            <button
              onClick={onArchive}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              В архив
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-400"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs px-2.5 py-1">
      {children}
    </span>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'rose'
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : accent === 'rose'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-slate-700 dark:text-slate-200'
  return (
    <div>
      <div className="text-slate-400 dark:text-slate-500">{label}</div>
      <div className={`font-medium ${color}`}>{value}</div>
    </div>
  )
}

// Лёгкий SVG-спарклайн цен по времени (без зависимостей).
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null
  const w = 80
  const h = 32
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * w
      const y = h - ((p - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastBelowFirst = series[series.length - 1] <= series[0]
  const stroke = lastBelowFirst ? '#10b981' : '#f43f5e' // emerald / rose
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

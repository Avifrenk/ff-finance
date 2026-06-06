import { useMemo, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useFlightRoutes, type FlightRoute } from '../hooks/useFlightRoutes'
import { useTelegramLink } from '../hooks/useTelegramLink'
import { RouteCard } from '../components/RouteCard'
import { RouteDialog } from '../components/RouteDialog'
import { TelegramLinkDialog } from '../components/TelegramLinkDialog'
import { PrimaryButton } from '../components/AuthControls'

export function Flights() {
  const { household } = useApp()
  const { routes, stats, loading, create, setArchived, remove } = useFlightRoutes()
  const { linked, chatId, loading: linkLoading } = useTelegramLink()

  const [routeOpen, setRouteOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  const [active, archived] = useMemo(() => {
    const a: FlightRoute[] = []
    const z: FlightRoute[] = []
    for (const r of routes) (r.status === 'archived' ? z : a).push(r)
    return [a, z]
  }, [routes])

  if (!household) return null

  // «+ Маршрут»: без привязки Telegram создать нельзя (боту некуда слать пуш).
  function handleAdd() {
    if (linked) setRouteOpen(true)
    else setLinkOpen(true)
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            ✈️ Авиабилеты
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Следим за ценами на нужные рейсы. Цена упадёт — придёт пуш в Telegram.
          </p>
        </div>
        <PrimaryButton onClick={handleAdd}>+ Маршрут</PrimaryButton>
      </header>

      {/* Напоминание привязать Telegram */}
      {!linkLoading && !linked && (
        <button
          onClick={() => setLinkOpen(true)}
          className="w-full text-left rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center gap-3 hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors"
        >
          <span className="text-2xl">🔔</span>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-medium">Привяжите Telegram</span> — без этого бот не
            сможет прислать вам пуш о скидке (и нельзя завести маршрут). Нажмите, чтобы
            привязать за минуту.
          </span>
        </button>
      )}

      {loading && active.length === 0 && archived.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
      )}

      {!loading && active.length === 0 && archived.length === 0 && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">✈️</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Пока ни одного маршрута. Добавьте первый — например, Тель-Авив → Нью-Йорк на
            нужные даты, и мы будем ловить дешёвые билеты.
          </p>
          <div className="inline-block">
            <PrimaryButton onClick={handleAdd}>+ Добавить маршрут</PrimaryButton>
          </div>
        </section>
      )}

      <div className="space-y-4">
        {active.map((r) => (
          <RouteCard
            key={r.id}
            route={r}
            stats={stats[r.id]}
            onArchive={() => setArchived(r.id, true)}
            onRestore={() => setArchived(r.id, false)}
            onDelete={async () => {
              if (
                confirm(
                  `Удалить маршрут ${r.origin} → ${r.destination}? История наблюдений по нему тоже удалится.`,
                )
              ) {
                await remove(r.id)
              }
            }}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Архив ({archived.length})
          </summary>
          <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
            {archived.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                stats={stats[r.id]}
                onArchive={() => setArchived(r.id, true)}
                onRestore={() => setArchived(r.id, false)}
                onDelete={async () => {
                  if (
                    confirm(
                      `Удалить маршрут ${r.origin} → ${r.destination}? История наблюдений по нему тоже удалится.`,
                    )
                  ) {
                    await remove(r.id)
                  }
                }}
              />
            ))}
          </div>
        </details>
      )}

      <TelegramLinkDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={() => setRouteOpen(true)}
      />
      {chatId !== null && (
        <RouteDialog
          open={routeOpen}
          onClose={() => setRouteOpen(false)}
          ownerChatId={chatId}
          onCreate={async (input) => {
            await create(input)
          }}
        />
      )}
    </div>
  )
}

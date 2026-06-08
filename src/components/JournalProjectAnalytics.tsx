import { useMemo, useState } from 'react'
import { PeriodPicker } from './PeriodPicker'
import { rangeFor, type DashboardPeriod } from '../lib/period'
import { useFxRates } from '../hooks/useFxRates'
import { formatMoney } from '../lib/format'
import { getCurrencies, todayLocalISO } from '../lib/wjValues'
import type { WjField } from '../hooks/useWjFields'
import type { WjRecord } from '../hooks/useWjRecords'
import type { WjClient } from '../hooks/useWjClients'
import {
  analyzeProject,
  type MoneyTotal,
  type WjAnalytics,
} from '../lib/wjAggregate'

// Дашборд аналитики внутри карточки проекта (Фаза 7). Считается по полям с
// analytics_role поверх wj_records. Деградирует: показывает только те метрики,
// для которых есть поля (money/status/date/client). Конвертация — convertMoney
// на дату платежа, нет курса → пометка «прибл.» (missingRate, как в FF).
export function JournalProjectAnalytics({
  records,
  fields,
  clients,
  clientFields,
}: {
  records: WjRecord[]
  fields: WjField[]
  clients: WjClient[]
  clientFields: WjField[]
}) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<DashboardPeriod>('month')
  const { ratesByDate } = useFxRates()
  const today = todayLocalISO()

  // База: первая валюта первого income-money-поля, иначе ILS.
  const base = useMemo(() => baseCurrencyOf(fields), [fields])
  const range = useMemo(() => rangeFor(period), [period])

  const a = useMemo<WjAnalytics>(
    () => analyzeProject(records, fields, range, ratesByDate, base, today, clients, clientFields),
    [records, fields, range, ratesByDate, base, today, clients, clientFields],
  )

  const cap = a.capabilities
  const hasAny = cap.money || cap.status || cap.due || cap.client

  if (!hasAny) return null // совсем нечего показывать (нет аналитических полей)

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-medium text-slate-900 dark:text-slate-100">📊 Аналитика</span>
        <span aria-hidden className="text-slate-400">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <PeriodPicker value={period} onChange={setPeriod} />
            <span className="text-xs text-slate-400">
              записей за период: {a.recordsInPeriod}
            </span>
          </div>

          {/* Доход / расход / итог */}
          {cap.money && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {cap.income && (
                <TotalCard label="Доход" total={a.income} base={base} tone="income" />
              )}
              {cap.expense && (
                <TotalCard label="Расход" total={a.expense} base={base} tone="expense" />
              )}
              {cap.income && cap.expense && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Итог (доход − расход)</div>
                  <div
                    className={`mt-1 text-lg font-semibold ${
                      a.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                    }`}
                  >
                    {formatMoney(a.net, base, 0)}
                    {a.netMissingRate && <ApproxMark />}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Динамика дохода */}
          {cap.income && a.timeline.buckets.length > 0 && (
            <Timeline analytics={a} base={base} />
          )}

          {/* «Куда оплата» (Мазаль) */}
          {a.payee && (
            <Block title="Куда оплата">
              <ul className="space-y-1 text-sm">
                {a.payee.rows.map((r) => (
                  <li key={r.value} className="flex items-center justify-between">
                    <span className={r.isSelf ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-600 dark:text-slate-300'}>
                      {r.isSelf ? `${r.value} (я)` : r.value}
                    </span>
                    <span className="tabular-nums text-slate-700 dark:text-slate-200">
                      {formatMoney(r.total, base, 0)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                мой доход = {formatMoney(a.payee.selfTotal, base, 0)}
                {a.payee.missingRate && <ApproxMark />}
              </p>
            </Block>
          )}

          {/* Расход по назначению */}
          {cap.expense && a.expenseByPurpose.length > 0 && (
            <Block title="Расход по назначению">
              <BarList
                items={a.expenseByPurpose.map((p) => ({
                  label: p.purpose,
                  value: p.total,
                  hint: `${p.count}×`,
                  missingRate: p.missingRate,
                }))}
                base={base}
              />
            </Block>
          )}

          {/* По клиентам */}
          {cap.client && a.clients.length > 0 && (
            <Block title="По клиентам">
              <ul className="space-y-1.5 text-sm">
                {a.clients.slice(0, 8).map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {c.name}
                      {c.count > 1 && (
                        <span className="ml-1 text-xs text-indigo-500">×{c.count} повторных</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
                      {formatMoney(c.total, base, 0)}
                      {c.missingRate && <ApproxMark />}
                    </span>
                  </li>
                ))}
              </ul>
              {a.clients.length > 8 && (
                <p className="mt-1 text-xs text-slate-400">…и ещё {a.clients.length - 8}</p>
              )}
            </Block>
          )}

          {/* Статусы / воронка */}
          {cap.status && (a.statuses.length > 0 || a.noStatusCount > 0) && (
            <Block title="Статусы">
              <div className="flex flex-wrap gap-1.5">
                {a.statuses.map((s) => (
                  <span
                    key={s.value}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-slate-700 dark:text-slate-200"
                    style={{ background: s.color ?? '#e2e8f0' }}
                  >
                    {s.value} <b className="tabular-nums">{s.count}</b>
                  </span>
                ))}
                {a.noStatusCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-slate-400 border border-slate-200 dark:border-slate-700">
                    без статуса <b className="tabular-nums">{a.noStatusCount}</b>
                  </span>
                )}
              </div>
            </Block>
          )}

          {/* Долги (незаполненные платежи) */}
          {a.unpaid.length > 0 && (
            <Block title="Долги по платежам">
              <ul className="space-y-2 text-sm">
                {a.unpaid.map((g) => (
                  <li key={g.fieldKey}>
                    <div className="text-slate-600 dark:text-slate-300">
                      {g.fieldLabel}: не заполнено у{' '}
                      <b>{g.count}</b>
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {g.records.slice(0, 6).map((r) => r.title).join(', ')}
                      {g.records.length > 6 ? ', …' : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {/* Просрочки */}
          {cap.due && a.overdue.length > 0 && (
            <Block title="Просрочки">
              <ul className="space-y-1 text-sm">
                {a.overdue.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                      {o.title}
                      {o.status && <span className="ml-1 text-xs text-slate-400">· {o.status}</span>}
                    </span>
                    <span className="shrink-0 text-rose-500 tabular-nums">{fmtDay(o.date)}</span>
                  </li>
                ))}
              </ul>
              {a.overdue.length > 8 && (
                <p className="mt-1 text-xs text-slate-400">…и ещё {a.overdue.length - 8}</p>
              )}
            </Block>
          )}

          {a.recordsInPeriod === 0 && (
            <p className="text-sm text-slate-400">За выбранный период данных нет.</p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Вспомогательные компоненты ────────────────────────────────────────────────
function TotalCard({
  label,
  total,
  base,
  tone,
}: {
  label: string
  total: MoneyTotal
  base: string
  tone: 'income' | 'expense'
}) {
  const color = tone === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
  const others = Object.entries(total.byCurrency).filter(([c]) => c !== base)
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>
        {formatMoney(total.base, base, 0)}
        {total.missingRate && <ApproxMark />}
      </div>
      {others.length > 0 && (
        <div className="mt-0.5 text-[11px] text-slate-400">
          {others.map(([c, v]) => formatMoney(v, c, 0)).join(' · ')}
        </div>
      )}
    </div>
  )
}

function Timeline({ analytics, base }: { analytics: WjAnalytics; base: string }) {
  const max = Math.max(...analytics.timeline.buckets.map((b) => b.total), 1)
  return (
    <Block title="Динамика дохода">
      <div className="space-y-1">
        {analytics.timeline.buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-slate-400">{b.label}</span>
            <span className="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <span
                className="block h-full bg-emerald-400/70 dark:bg-emerald-500/60"
                style={{ width: `${Math.max(2, (b.total / max) * 100)}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums text-slate-600 dark:text-slate-300">
              {formatMoney(b.total, base, 0)}
            </span>
          </div>
        ))}
      </div>
    </Block>
  )
}

function BarList({
  items,
  base,
}: {
  items: { label: string; value: number; hint?: string; missingRate?: boolean }[]
  base: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-1.5">
      {items.slice(0, 8).map((it, i) => (
        <div key={i} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
              {it.label}
              {it.hint && <span className="ml-1 text-xs text-slate-400">{it.hint}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">
              {formatMoney(it.value, base, 0)}
              {it.missingRate && <ApproxMark />}
            </span>
          </div>
          <span className="mt-0.5 block h-1.5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <span
              className="block h-full bg-rose-400/70"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
            />
          </span>
        </div>
      ))}
      {items.length > 8 && (
        <p className="text-xs text-slate-400">…и ещё {items.length - 8}</p>
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h4>
      {children}
    </div>
  )
}

// Пометка «приблизительно» — часть валют не сконвертирована (нет курса).
function ApproxMark() {
  return (
    <span title="Часть валют без курса — итог приблизительный" className="ml-1 text-amber-500">
      ≈
    </span>
  )
}

function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// База конвертации: первая валюта первого income-money-поля, иначе ILS.
function baseCurrencyOf(fields: WjField[]): string {
  const inc = fields.find((f) => f.type === 'money' && f.money_direction === 'income')
  const any = inc ?? fields.find((f) => f.type === 'money')
  if (!any) return 'ILS'
  const curs = getCurrencies(any)
  return curs[0] ?? 'ILS'
}

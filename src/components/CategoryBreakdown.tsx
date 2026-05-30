import { useState } from 'react'
import { categoryColor, type CategoryAgg } from '../lib/aggregate'
import { formatMoney } from '../lib/format'

interface Props {
  items: CategoryAgg[]
  total: number
  baseCurrency: string
  /** Подпись пустого состояния (например, «За этот месяц расходов нет»). */
  emptyHint: string
}

/**
 * Donut (SVG) + список категорий с долями.
 * Ховер по сегменту/строке подсвечивает связку.
 *
 * Считаем donut только если категорий ≥ 2 — для 1 категории donut бессмыслен,
 * рисуем только список.
 */
export function CategoryBreakdown({ items, total, baseCurrency, emptyHint }: Props) {
  const [active, setActive] = useState<string | null>(null)

  if (items.length === 0 || total <= 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{emptyHint}</p>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5 items-center">
      {items.length >= 2 && (
        <div className="mx-auto">
          <Donut items={items} active={active} onHover={setActive} />
        </div>
      )}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const color = categoryColor(item, i)
          const key = item.categoryId ?? `nocat-${i}`
          const isActive = active === key
          return (
            <li
              key={key}
              onMouseEnter={() => setActive(key)}
              onMouseLeave={() => setActive(null)}
              className={`flex items-center gap-2 text-sm py-1 px-1.5 -mx-1.5 rounded transition-colors ${
                isActive ? 'bg-slate-100 dark:bg-slate-800' : ''
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-base shrink-0">{item.icon ?? '•'}</span>
              <span className="flex-1 min-w-0 truncate text-slate-900 dark:text-slate-100">
                {item.name}
              </span>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {Math.round(item.share * 100)}%
              </span>
              <span className="text-sm tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {formatMoney(item.total, baseCurrency, 0)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Donut({
  items,
  active,
  onHover,
}: {
  items: CategoryAgg[]
  active: string | null
  onHover: (key: string | null) => void
}) {
  // SVG-донат: viewBox 100×100, центр (50,50), внешний радиус 45, внутренний 30.
  // Каждый сегмент — SVG-path с arc'ом, начинаем с -90° (12 часов) по часовой.
  const size = 140
  const cx = 50
  const cy = 50
  const rOuter = 45
  const rInner = 28
  const startAngles: number[] = []
  let acc = -Math.PI / 2
  for (const item of items) {
    startAngles.push(acc)
    acc += item.share * Math.PI * 2
  }
  const segments = items.map((item, i) => {
    const angleStart = startAngles[i]
    const angleEnd = angleStart + item.share * Math.PI * 2
    return {
      key: item.categoryId ?? `nocat-${i}`,
      color: categoryColor(item, i),
      path: donutPath(cx, cy, rOuter, rInner, angleStart, angleEnd),
    }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Доли категорий">
      {segments.map((s) => {
        const dim = active !== null && active !== s.key
        return (
          <path
            key={s.key}
            d={s.path}
            fill={s.color}
            opacity={dim ? 0.25 : 1}
            onMouseEnter={() => onHover(s.key)}
            onMouseLeave={() => onHover(null)}
            style={{ transition: 'opacity 120ms' }}
          />
        )
      })}
    </svg>
  )
}

function donutPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  angleStart: number,
  angleEnd: number,
): string {
  // Полный круг (1 сегмент = 100%) — особый случай: SVG arc не умеет 360°,
  // рисуем как 2 половинки или просто 2 круга. Здесь — два полукруга через 359.99°.
  const span = angleEnd - angleStart
  if (span >= Math.PI * 2 - 1e-6) {
    const mid = angleStart + Math.PI
    return [
      donutPath(cx, cy, rOuter, rInner, angleStart, mid),
      donutPath(cx, cy, rOuter, rInner, mid, angleEnd - 1e-4),
    ].join(' ')
  }
  const largeArc = span > Math.PI ? 1 : 0
  const sx = cx + rOuter * Math.cos(angleStart)
  const sy = cy + rOuter * Math.sin(angleStart)
  const ex = cx + rOuter * Math.cos(angleEnd)
  const ey = cy + rOuter * Math.sin(angleEnd)
  const sxi = cx + rInner * Math.cos(angleEnd)
  const syi = cy + rInner * Math.sin(angleEnd)
  const exi = cx + rInner * Math.cos(angleStart)
  const eyi = cy + rInner * Math.sin(angleStart)
  return [
    `M ${sx.toFixed(3)} ${sy.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`,
    `L ${sxi.toFixed(3)} ${syi.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${exi.toFixed(3)} ${eyi.toFixed(3)}`,
    'Z',
  ].join(' ')
}

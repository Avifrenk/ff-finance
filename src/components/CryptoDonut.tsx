import { useState } from 'react'
import type { AllocationItem } from '../lib/crypto'
import { formatMoney } from '../lib/format'

interface Props {
  items: AllocationItem[]
  totalValue: number
  baseCurrency: string
  size?: number
}

// Палитра для монет: фиксированные цвета по индексу. Без бренд-лого монет —
// слишком много assets, для MVP цветной кружок достаточен.
const COIN_COLORS = [
  '#f7931a', // BTC orange
  '#627eea', // ETH purple-blue
  '#26a17b', // USDT green
  '#2775ca', // USDC blue
  '#14f195', // SOL mint
  '#8247e5', // fallback violet
  '#e84142', // fallback red
  '#0533b3', // fallback navy
]

export function CryptoDonut({ items, totalValue, baseCurrency, size = 160 }: Props) {
  const [active, setActive] = useState<string | null>(null)

  if (items.length === 0 || totalValue <= 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-5 items-center">
      <div className="mx-auto">
        <Donut items={items} active={active} onHover={setActive} size={size} />
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const color = COIN_COLORS[i % COIN_COLORS.length]
          const isActive = active === item.coinId
          return (
            <li
              key={item.coinId}
              onMouseEnter={() => setActive(item.coinId)}
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
              <span className="flex-1 min-w-0 truncate text-slate-900 dark:text-slate-100">
                {item.symbol}
              </span>
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {Math.round(item.share * 100)}%
              </span>
              <span className="text-sm tabular-nums font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {formatMoney(item.valueBase, baseCurrency, 0)}
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
  size,
}: {
  items: AllocationItem[]
  active: string | null
  onHover: (key: string | null) => void
  size: number
}) {
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
      key: item.coinId,
      color: COIN_COLORS[i % COIN_COLORS.length],
      path: donutPath(cx, cy, rOuter, rInner, angleStart, angleEnd),
    }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Доли монет в портфеле">
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

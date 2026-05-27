const CURRENCY_SYMBOL: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
}

export function formatMoney(amount: number, currency = 'ILS'): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return `${sign}${abs} ${symbol}`
}

export function formatDate(iso: string): string {
  // 'YYYY-MM-DD' → 'D MMM' (на русском)
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const CURRENCY_SYMBOL: Record<string, string> = {
  ILS: '₪',
  USD: '$',
  EUR: '€',
  GBP: '£',
  RUB: '₽',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code] ?? code
}

export function formatMoney(amount: number, currency = 'ILS', decimals = 2): string {
  const symbol = currencySymbol(currency)
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
  return `${sign}${abs} ${symbol}`
}

export function formatDate(iso: string): string {
  // 'YYYY-MM-DD' → 'D MMM' (на русском)
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

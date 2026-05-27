// Конверсия валют через EUR-cross.
//
// Структура курсов: Map по as_of (YYYY-MM-DD), внутри — Map<code, rate_to_EUR>.
// rate_to_EUR — это сколько единиц EUR за 1 единицу code (то есть колонка
// fx_rates.rate при base_code=code, quote_code='EUR'). EUR в самой карте
// присутствует с rate=1 (или просто считаем 1 при отсутствии).
//
// convertMoney(amount, from, to, ratesByDate, onDate?):
//   * from === to → amount
//   * иначе ищем самую свежую дату <= onDate (или последнюю в карте);
//   * amount * rateToEur(from) / rateToEur(to).

export type RatesByDate = Map<string, Map<string, number>>

function rateToEur(rates: Map<string, number>, code: string): number | null {
  if (code === 'EUR') return 1
  const r = rates.get(code)
  return r && r > 0 ? r : null
}

function pickDate(ratesByDate: RatesByDate, onDate: string | undefined): string | null {
  if (ratesByDate.size === 0) return null
  const dates = [...ratesByDate.keys()].sort()
  if (!onDate) return dates[dates.length - 1]
  // Ближайшая дата <= onDate.
  let chosen: string | null = null
  for (const d of dates) {
    if (d <= onDate) chosen = d
    else break
  }
  // Если onDate раньше всех — берём самую раннюю доступную.
  return chosen ?? dates[0]
}

export function convertMoney(
  amount: number,
  from: string,
  to: string,
  ratesByDate: RatesByDate,
  onDate?: string,
): number | null {
  if (!isFinite(amount)) return null
  if (from === to) return amount
  const date = pickDate(ratesByDate, onDate)
  if (!date) return null
  const rates = ratesByDate.get(date)!
  const fromToEur = rateToEur(rates, from)
  const toToEur = rateToEur(rates, to)
  if (fromToEur === null || toToEur === null) return null
  return (amount * fromToEur) / toToEur
}

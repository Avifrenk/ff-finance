// Разворачивание operation_schedules.cadence_rule в конкретные даты внутри месяца.
//
// Cadence-форматы поддерживаются те же, что в tick_schedules() миграции
// Фазы 2.9: 'daily', 'weekly:<dow>' (dow: 0=вс, 1=пн … 6=сб), 'monthly:<n>'
// (n: 1..28).
//
// Логика: для отображения календаря "май 2026" нам нужны все даты, в которые
// schedule сработает в течение этого месяца. Если schedule.next_run_at >
// конца месяца — вообще ничего, schedule в этом месяце не сработает.
//
// Если в данный конкретный день уже создана операция (по этому schedule —
// определяем по transfer_id=null + author + cadence_rule), мы её всё равно
// показываем в календаре, но это уже дело Dashboard'а (он матчит).
//
// Эти функции — чистые, без I/O.

export interface ScheduleLike {
  id: string
  cadence_rule: string
  next_run_at: string // YYYY-MM-DD
  is_active: boolean
}

const iso = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Все даты YYYY-MM-DD в указанном месяце (year, monthIndex 0-11), на которые
 * приходится сработка `cadence_rule`, начиная с `next_run_at` (раньше — нет).
 *
 * Возвращает отсортированный массив дат. Пустой — если schedule в этом месяце
 * не сработает.
 */
export function expandCadenceInMonth(
  cadence_rule: string,
  next_run_at: string,
  year: number,
  monthIndex: number,
): string[] {
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const startIso = iso(firstDay)
  const endIso = iso(lastDay)
  // Нижняя граница — max(start of month, next_run_at).
  const lowerIso = next_run_at > startIso ? next_run_at : startIso

  if (cadence_rule === 'daily') {
    const out: string[] = []
    const [ly, lm, ld] = lowerIso.split('-').map(Number)
    const cur = new Date(ly, lm - 1, ld)
    while (iso(cur) <= endIso) {
      out.push(iso(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }

  const [kind, argRaw] = cadence_rule.split(':')

  if (kind === 'weekly') {
    const dow = Number(argRaw)
    if (!Number.isFinite(dow) || dow < 0 || dow > 6) return []
    const out: string[] = []
    const [ly, lm, ld] = lowerIso.split('-').map(Number)
    const cur = new Date(ly, lm - 1, ld)
    // Сдвигаем cur вперёд до ближайшего dow.
    const diff = (dow - cur.getDay() + 7) % 7
    cur.setDate(cur.getDate() + diff)
    while (iso(cur) <= endIso) {
      out.push(iso(cur))
      cur.setDate(cur.getDate() + 7)
    }
    return out
  }

  if (kind === 'monthly') {
    const n = Number(argRaw)
    if (!Number.isFinite(n) || n < 1 || n > 28) return []
    const candidate = new Date(year, monthIndex, n)
    const candIso = iso(candidate)
    if (candIso < lowerIso) return []
    if (candIso > endIso) return []
    return [candIso]
  }

  return []
}

/** Сетка месяца: 6 строк по 7 дней, начиная с понедельника той недели,
 *  в которой лежит 1-е число месяца. Возвращает массив YYYY-MM-DD длиной 42. */
export function monthGrid(year: number, monthIndex: number): string[] {
  const first = new Date(year, monthIndex, 1)
  // Сдвиг от понедельника: dow 1=пн..0=вс → diff = (dow + 6) % 7.
  const diff = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - diff)
  const out: string[] = []
  const cur = new Date(start)
  for (let i = 0; i < 42; i++) {
    out.push(iso(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** Имя месяца на русском, с большой буквы: «Май 2026». */
export function humanMonthFull(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1)
  const s = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Агрегатор аналитики задачника по записям проекта (wj_records.values jsonb).
// Чистые функции, без I/O — на входе уже загруженные records/fields + курсы.
// Заточен под jsonb-модель полей (а не operations-схему lib/aggregate.ts).
//
// Денежная модель (Фаза 1): money-поле = {amount, currency(, purpose)} c
// направлением income|expense. У каждого money-поля по смыслу своя дата платежа,
// но в плоской схеме связи поле↔дата нет — поэтому считаем ОДНУ дату платежа на
// запись по приоритету ролей (date_payment → date_due → любое date → created_at).
// Валюты НЕ складываем вслепую: конвертируем в base через convertMoney на дату
// платежа; если курса нет (напр. ILS/RUB вне ECB) — помечаем missingRate, как в FF.
//
// Срезы period-bound (по дате платежа): доход, расход, динамика, по клиентам,
// по назначению, «куда оплата». Срезы-снимок (по всем записям): статусы/воронка,
// долги (незаполненные платежи), просрочки.
import { convertMoney, type RatesByDate } from './fx'
import type { DateRange } from './aggregate'
import type { WjField } from '../hooks/useWjFields'
import {
  parseMoney,
  parseMoneyList,
  parseDate,
  asString,
  getChoices,
  recordTitle,
  type WjMoney,
} from './wjValues'

// Минимальная форма записи — WjRecord совместим, но не тащим хук в чистый модуль.
export interface WjAggRecord {
  id: string
  values: Record<string, unknown>
  created_at: string
}

export type Gran = 'day' | 'week' | 'month'

export interface MoneyTotal {
  base: number // сумма, сконвертированная в base
  byCurrency: Record<string, number> // сырые суммы по валютам (без конвертации)
  missingRate: boolean // хотя бы одно значение не удалось сконвертировать
}

export interface TimelineBucket {
  key: string
  label: string
  total: number // доход в base за корзину
}

export interface PurposeAgg {
  purpose: string
  total: number // base
  byCurrency: Record<string, number>
  count: number
  missingRate: boolean
}

export interface ClientAgg {
  key: string // нормализованный ключ имя|телефон
  name: string
  phone: string
  count: number // число записей (заказов) за период
  total: number // принесённый доход в base
  missingRate: boolean
  lastDate: string // последняя дата платежа
}

export interface StatusCount {
  value: string
  color?: string
  count: number
  known: boolean // false → значение удалено из choices («прочее»)
}

export interface UnpaidGroup {
  fieldKey: string
  fieldLabel: string
  count: number
  records: { id: string; title: string }[]
}

export interface OverdueItem {
  id: string
  title: string
  date: string
  status: string | null
}

export interface PayeeRow {
  value: string
  total: number // base
  isSelf: boolean
}

export interface PayeeSplit {
  fieldLabel: string
  rows: PayeeRow[]
  selfValue: string
  selfTotal: number // «мой доход» в base
  missingRate: boolean
}

export interface WjAnalytics {
  base: string
  capabilities: {
    money: boolean
    income: boolean
    expense: boolean
    status: boolean
    client: boolean
    due: boolean
    payee: boolean
  }
  recordsInPeriod: number
  totalRecords: number
  income: MoneyTotal
  expense: MoneyTotal
  net: number // доход − расход (base)
  netMissingRate: boolean
  timeline: { gran: Gran; buckets: TimelineBucket[] }
  expenseByPurpose: PurposeAgg[]
  clients: ClientAgg[]
  statuses: StatusCount[]
  noStatusCount: number
  unpaid: UnpaidGroup[]
  overdue: OverdueItem[]
  payee: PayeeSplit | null
}

// ── Поиск полей по роли/типу ────────────────────────────────────────────────
function incomeFields(fields: WjField[]): WjField[] {
  return fields.filter((f) => f.type === 'money' && f.money_direction === 'income')
}
function expenseFields(fields: WjField[]): WjField[] {
  return fields.filter((f) => f.type === 'money' && f.money_direction === 'expense')
}
function statusFieldOf(fields: WjField[]): WjField | undefined {
  return (
    fields.find((f) => f.type === 'status') ??
    fields.find((f) => f.analytics_role === 'status')
  )
}
function clientFieldOf(fields: WjField[]): WjField | undefined {
  return (
    fields.find((f) => f.analytics_role === 'client_name') ??
    fields.find((f) => f.type === 'text')
  )
}
function phoneFieldOf(fields: WjField[]): WjField | undefined {
  return fields.find((f) => f.type === 'phone')
}
function dueFieldOf(fields: WjField[]): WjField | undefined {
  return (
    fields.find((f) => f.type === 'date' && f.analytics_role === 'date_due') ??
    fields.find((f) => f.type === 'date')
  )
}
// Дата платежа записи: приоритет date_payment → date_due → любое date → created_at.
function paymentDateOf(rec: WjAggRecord, fields: WjField[]): string {
  const order: ((f: WjField) => boolean)[] = [
    (f) => f.type === 'date' && f.analytics_role === 'date_payment',
    (f) => f.type === 'date' && f.analytics_role === 'date_due',
    (f) => f.type === 'date',
  ]
  for (const pred of order) {
    for (const f of fields) {
      if (!pred(f)) continue
      const d = parseDate(rec.values[f.key])
      if (d) return d
    }
  }
  return rec.created_at.slice(0, 10)
}

// Select-поле «куда оплата» (Мазаль): среди choices есть «мне»/«я»/self/me.
function payeeFieldOf(fields: WjField[]): { field: WjField; selfValue: string } | null {
  for (const f of fields) {
    if (f.type !== 'select') continue
    const self = getChoices(f).find((c) => isSelfValue(c.value))
    if (self) return { field: f, selfValue: self.value }
  }
  return null
}
function isSelfValue(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === 'мне' || s === 'я' || s === 'me' || s === 'self' || s.includes('мне')
}

// ── Нормализация ─────────────────────────────────────────────────────────────
function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
function normPhone(s: string): string {
  return s.replace(/\D+/g, '')
}
export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to
}

// ── Конвертация одного money-значения в base ────────────────────────────────
function convertOne(
  m: WjMoney,
  base: string,
  rates: RatesByDate,
  onDate: string,
): number | null {
  if (m.currency === base) return m.amount
  return convertMoney(m.amount, m.currency, base, rates, onDate)
}
function addToTotal(acc: MoneyTotal, m: WjMoney, conv: number | null): void {
  acc.byCurrency[m.currency] = (acc.byCurrency[m.currency] ?? 0) + m.amount
  if (conv === null) acc.missingRate = true
  else acc.base += conv
}
function emptyTotal(): MoneyTotal {
  return { base: 0, byCurrency: {}, missingRate: false }
}

// ── Корзины динамики ─────────────────────────────────────────────────────────
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000,
  )
}
function pickGran(range: DateRange): Gran {
  const days = daysBetween(range.from, range.to)
  if (days <= 45) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}
function bucketKey(iso: string, gran: Gran): string {
  if (gran === 'day') return iso
  if (gran === 'month') return iso.slice(0, 7)
  // week → понедельник недели
  const d = new Date(iso + 'T00:00:00')
  const shift = (d.getDay() + 6) % 7 // Пн=0
  d.setDate(d.getDate() - shift)
  return isoDate(d)
}
function bucketLabel(key: string, gran: Gran): string {
  if (gran === 'month') {
    const d = new Date(key + '-01T00:00:00')
    return d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
  }
  const d = new Date(key + 'T00:00:00')
  const s = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return gran === 'week' ? `с ${s}` : s
}

// ── Главная агрегация ────────────────────────────────────────────────────────
export function analyzeProject(
  records: WjAggRecord[],
  fields: WjField[],
  range: DateRange,
  rates: RatesByDate,
  base: string,
  today: string,
): WjAnalytics {
  const incFields = incomeFields(fields)
  const expFields = expenseFields(fields)
  const statusField = statusFieldOf(fields)
  const clientField = clientFieldOf(fields)
  const phoneField = phoneFieldOf(fields)
  const dueField = dueFieldOf(fields)
  const payee = payeeFieldOf(fields)

  const income = emptyTotal()
  const expense = emptyTotal()
  const purposeMap = new Map<string, PurposeAgg>()
  const clientMap = new Map<string, ClientAgg>()
  const bucketMap = new Map<string, number>()
  const gran = pickGran(range)
  const payeeMap = new Map<string, { total: number; isSelf: boolean }>()
  let payeeMissing = false
  let recordsInPeriod = 0

  for (const rec of records) {
    const date = paymentDateOf(rec, fields)
    if (!inRange(date, range)) continue
    recordsInPeriod++

    // Доход записи (для клиента/динамики/«куда оплата»).
    let recIncomeBase = 0
    let recIncomeMissing = false
    for (const f of incFields) {
      const m = parseMoney(rec.values[f.key])
      if (!m) continue
      const conv = convertOne(m, base, rates, date)
      addToTotal(income, m, conv)
      if (conv === null) recIncomeMissing = true
      else recIncomeBase += conv

      // Корзина динамики (только сконвертированный доход).
      if (conv !== null) {
        const k = bucketKey(date, gran)
        bucketMap.set(k, (bucketMap.get(k) ?? 0) + conv)
      }

      // «Куда оплата».
      if (payee) {
        const val = asString(rec.values[payee.field.key]).trim() || '—'
        const cur = payeeMap.get(val) ?? { total: 0, isSelf: val === payee.selfValue }
        if (conv === null) payeeMissing = true
        else cur.total += conv
        payeeMap.set(val, cur)
      }
    }

    // Расход записи + разбивка по назначению. Расход — список строк
    // (несколько позиций: «Ира очереди 150$», «Миша сопровождение 100$»).
    for (const f of expFields) {
      for (const m of parseMoneyList(rec.values[f.key])) {
        const conv = convertOne(m, base, rates, date)
        addToTotal(expense, m, conv)
        const key = (m.purpose ?? '').trim() || '— без назначения —'
        const agg =
          purposeMap.get(key) ??
          { purpose: key, total: 0, byCurrency: {}, count: 0, missingRate: false }
        agg.count++
        agg.byCurrency[m.currency] = (agg.byCurrency[m.currency] ?? 0) + m.amount
        if (conv === null) agg.missingRate = true
        else agg.total += conv
        purposeMap.set(key, agg)
      }
    }

    // По клиентам (агрегируем принесённый доход).
    if (clientField) {
      const name = asString(rec.values[clientField.key]).trim()
      const phone = phoneField ? asString(rec.values[phoneField.key]).trim() : ''
      const key = `${normName(name)}|${normPhone(phone)}`
      if (name || phone) {
        const c =
          clientMap.get(key) ??
          { key, name: name || '—', phone, count: 0, total: 0, missingRate: false, lastDate: date }
        c.count++
        c.total += recIncomeBase
        if (recIncomeMissing) c.missingRate = true
        if (date > c.lastDate) c.lastDate = date
        if (!c.name && name) c.name = name
        if (!c.phone && phone) c.phone = phone
        clientMap.set(key, c)
      }
    }
  }

  // Статусы/воронка — снимок по ВСЕМ записям (не period-bound).
  const statuses: StatusCount[] = []
  let noStatusCount = 0
  if (statusField) {
    const choices = getChoices(statusField)
    const counts = new Map<string, number>()
    let other = 0
    for (const rec of records) {
      const raw = asString(rec.values[statusField.key]).trim()
      if (!raw) {
        noStatusCount++
        continue
      }
      if (choices.some((c) => c.value === raw)) counts.set(raw, (counts.get(raw) ?? 0) + 1)
      else other++
    }
    for (const c of choices) {
      const n = counts.get(c.value) ?? 0
      if (n > 0) statuses.push({ value: c.value, color: c.color, count: n, known: true })
    }
    if (other > 0) statuses.push({ value: 'Прочее', count: other, known: false })
  }

  // Долги — незаполненные income-платежи у непустых записей (снимок).
  const unpaid: UnpaidGroup[] = []
  for (const f of incFields) {
    const recs: { id: string; title: string }[] = []
    for (const rec of records) {
      if (parseMoney(rec.values[f.key])) continue // платёж есть
      if (isBlankRecord(rec, fields)) continue // пустая болванка — не долг
      recs.push({ id: rec.id, title: recordTitle(rec.values, fields) })
    }
    if (recs.length) unpaid.push({ fieldKey: f.key, fieldLabel: f.label, count: recs.length, records: recs })
  }

  // Просрочки — date_due < today и запись не в терминальном статусе (снимок).
  const overdue: OverdueItem[] = []
  if (dueField) {
    const terminal = terminalStatusValue(statusField)
    for (const rec of records) {
      const d = parseDate(rec.values[dueField.key])
      if (!d || d >= today) continue
      const st = statusField ? asString(rec.values[statusField.key]).trim() : ''
      if (terminal && st === terminal) continue
      overdue.push({ id: rec.id, title: recordTitle(rec.values, fields), date: d, status: st || null })
    }
    overdue.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Динамика → массив, отсортированный по ключу.
  const buckets: TimelineBucket[] = [...bucketMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, total]) => ({ key, label: bucketLabel(key, gran), total }))

  // Топ по назначению / по клиентам.
  const expenseByPurpose = [...purposeMap.values()].sort((a, b) => b.total - a.total)
  const clients = [...clientMap.values()].sort((a, b) => b.total - a.total)

  // «Куда оплата».
  let payeeSplit: PayeeSplit | null = null
  if (payee && payeeMap.size > 0) {
    const rows: PayeeRow[] = [...payeeMap.entries()]
      .map(([value, v]) => ({ value, total: v.total, isSelf: v.isSelf }))
      .sort((a, b) => b.total - a.total)
    const selfTotal = rows.filter((r) => r.isSelf).reduce((s, r) => s + r.total, 0)
    payeeSplit = {
      fieldLabel: payee.field.label,
      rows,
      selfValue: payee.selfValue,
      selfTotal,
      missingRate: payeeMissing,
    }
  }

  const net = income.base - expense.base
  return {
    base,
    capabilities: {
      money: incFields.length > 0 || expFields.length > 0,
      income: incFields.length > 0,
      expense: expFields.length > 0,
      status: !!statusField,
      client: !!clientField,
      due: !!dueField,
      payee: !!payee,
    },
    recordsInPeriod,
    totalRecords: records.length,
    income,
    expense,
    net,
    netMissingRate: income.missingRate || expense.missingRate,
    timeline: { gran, buckets },
    expenseByPurpose,
    clients,
    statuses,
    noStatusCount,
    unpaid,
    overdue,
    payee: payeeSplit,
  }
}

// Запись считается «болванкой» (не долг), если все её поля пусты.
function isBlankRecord(rec: WjAggRecord, fields: WjField[]): boolean {
  for (const f of fields) {
    const v = rec.values[f.key]
    if (v == null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    return false
  }
  return true
}

// Терминальный статус воронки = последнее значение в choices (для просрочек).
function terminalStatusValue(statusField: WjField | undefined): string | null {
  if (!statusField) return null
  const choices = getChoices(statusField)
  return choices.length ? choices[choices.length - 1].value : null
}

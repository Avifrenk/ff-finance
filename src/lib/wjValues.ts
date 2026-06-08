// Работа со значениями записей задачника (wj_records.values jsonb) и опциями
// полей (wj_fields.options). Значения свободны по схеме (jsonb), поэтому всё
// парсим защитно: битое значение → пусто/деградация, UI не роняем (Фаза 6/7).
import type {
  WjField,
  WjFieldType,
  WjAnalyticsRole,
  CreateWjFieldInput,
} from '../hooks/useWjFields'

// ── Формы значений по типу ───────────────────────────────────────────────
export interface WjMoney {
  amount: number
  currency: string
  purpose?: string // «на что» — обязателен у expense
}
export interface WjChecklistItem {
  text: string
  done: boolean
}
// Значение select/status — это value одного из choices поля.

// ── Опции полей (wj_fields.options) ──────────────────────────────────────
// select/status: { choices: [{value, color?}] }; money: { currencies: [..] }.
export interface WjChoice {
  value: string
  color?: string
}

export const BASE_CURRENCIES = ['ILS', 'RUB', 'USD', 'EUR'] as const

export function getChoices(field: Pick<WjField, 'options'>): WjChoice[] {
  const o = field.options
  if (!o) return []
  // основная форма: { choices: [...] }
  if (!Array.isArray(o) && Array.isArray((o as { choices?: unknown }).choices)) {
    return ((o as { choices: unknown[] }).choices)
      .map(toChoice)
      .filter((c): c is WjChoice => c !== null)
  }
  // терпим и голый массив (строки или объекты)
  if (Array.isArray(o)) return o.map(toChoice).filter((c): c is WjChoice => c !== null)
  return []
}

function toChoice(raw: unknown): WjChoice | null {
  if (typeof raw === 'string') {
    const v = raw.trim()
    return v ? { value: v } : null
  }
  if (raw && typeof raw === 'object') {
    const value = String((raw as { value?: unknown }).value ?? '').trim()
    if (!value) return null
    const color = (raw as { color?: unknown }).color
    return typeof color === 'string' && color ? { value, color } : { value }
  }
  return null
}

export function getCurrencies(field: Pick<WjField, 'options'>): string[] {
  const o = field.options
  if (o && !Array.isArray(o) && Array.isArray((o as { currencies?: unknown }).currencies)) {
    const list = ((o as { currencies: unknown[] }).currencies)
      .map((c) => String(c).trim())
      .filter(Boolean)
    if (list.length) return list
  }
  return ['ILS']
}

// ── Парсеры значений (защитные) ──────────────────────────────────────────
export function parseMoney(v: unknown): WjMoney | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const amount = Number((v as { amount?: unknown }).amount)
  const currency = String((v as { currency?: unknown }).currency ?? '').trim()
  if (!Number.isFinite(amount) || !currency) return null
  const purposeRaw = (v as { purpose?: unknown }).purpose
  const purpose = typeof purposeRaw === 'string' ? purposeRaw.trim() : ''
  return purpose ? { amount, currency, purpose } : { amount, currency }
}

// Список денежных строк (для расходов с несколькими позициями:
// «Ира очереди 150$», «Миша сопровождение 100$»). Терпим и одиночный объект
// (старая форма), и массив. Пустые/битые строки отбрасываем.
export function parseMoneyList(v: unknown): WjMoney[] {
  if (Array.isArray(v)) {
    return v.map(parseMoney).filter((m): m is WjMoney => m !== null)
  }
  const one = parseMoney(v)
  return one ? [one] : []
}

export function parseChecklist(v: unknown): WjChecklistItem[] {
  if (!Array.isArray(v)) return []
  return v
    .map((it) => {
      if (!it || typeof it !== 'object') return null
      const text = String((it as { text?: unknown }).text ?? '').trim()
      if (!text) return null
      return { text, done: Boolean((it as { done?: unknown }).done) }
    })
    .filter((x): x is WjChecklistItem => x !== null)
}

// Дата записи хранится ISO-датой 'YYYY-MM-DD'. Терпим и полный ISO-таймстамп.
export function parseDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : null
}

// text может быть мультизначным (несколько артикулов) → string | string[].
export function parseTextValues(v: unknown): string[] {
  if (typeof v === 'string') {
    const t = v.trim()
    return t ? [t] : []
  }
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean)
  }
  return []
}

// Сериализация мультизначного text: пусто → undefined (удалить ключ),
// одно → строка, несколько → массив.
export function serializeTextValues(values: string[]): string | string[] | undefined {
  const cleaned = values.map((s) => s.trim()).filter(Boolean)
  if (cleaned.length === 0) return undefined
  if (cleaned.length === 1) return cleaned[0]
  return cleaned
}

export function asString(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

// ── Локальная дата ────────────────────────────────────────────────────────
export function todayLocalISO(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// ── analytics_role: выводим эвристикой из типа (Ф1, пользователю не показываем) ─
// money → amount; status → status; date → срок (date_due); первое text-поле →
// client_name. Остальное — null. existingFields нужен, чтобы client_name достался
// только первому имени-полю (selfId исключаем при правке).
export function deriveAnalyticsRole(
  type: WjFieldType,
  existingFields: Pick<WjField, 'id' | 'type' | 'analytics_role'>[],
  selfId?: string,
): WjAnalyticsRole | null {
  switch (type) {
    case 'money':
      return 'amount'
    case 'status':
      return 'status'
    case 'date':
      return 'date_due'
    case 'text': {
      const taken = existingFields.some(
        (f) => f.id !== selfId && f.analytics_role === 'client_name',
      )
      return taken ? null : 'client_name'
    }
    default:
      return null
  }
}

// ── Slug для key поля (уникален в пределах проекта) ──────────────────────────
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(label: string, existingKeys: string[] = []): string {
  let base = label
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) base = 'field'
  let key = base
  let i = 2
  const taken = new Set(existingKeys)
  while (taken.has(key)) key = `${base}_${i++}`
  return key
}

// ── Стартовые пресеты (сид-заготовка wj_fields, не «шаблоны проектов») ───────
export type WjPresetId = 'clients' | 'checklist' | 'empty'

export interface WjPreset {
  id: WjPresetId
  title: string
  emoji: string
  hint: string
  fields: CreateWjFieldInput[] // sort_order проставим при сидинге по индексу
}

export const WJ_PRESETS: WjPreset[] = [
  {
    id: 'clients',
    title: 'Клиенты и заказы',
    emoji: '🧾',
    hint: 'Имя, телефон, статус, сумма, дата возврата',
    fields: [
      { key: 'client_name', label: 'Имя клиента', type: 'text', analytics_role: 'client_name' },
      { key: 'phone', label: 'Телефон', type: 'phone' },
      {
        key: 'status',
        label: 'Статус',
        type: 'status',
        analytics_role: 'status',
        options: {
          choices: [
            { value: 'Бронь', color: '#e0f2fe' },
            { value: 'Предоплата', color: '#fef9c3' },
            { value: 'Выдано', color: '#dcfce7' },
            { value: 'Возвращено', color: '#e2e8f0' },
          ],
        },
      },
      {
        key: 'amount',
        label: 'Сумма',
        type: 'money',
        money_direction: 'income',
        analytics_role: 'amount',
        options: { currencies: ['ILS'] },
      },
      { key: 'return_date', label: 'Дата возврата', type: 'date', analytics_role: 'date_due' },
    ],
  },
  {
    id: 'checklist',
    title: 'Чеклист по клиенту',
    emoji: '✅',
    hint: 'Имя, телефон, список услуг, статус, заметки',
    fields: [
      { key: 'client_name', label: 'Имя клиента', type: 'text', analytics_role: 'client_name' },
      { key: 'phone', label: 'Телефон', type: 'phone' },
      { key: 'services', label: 'Услуги', type: 'checklist' },
      {
        key: 'status',
        label: 'Статус',
        type: 'status',
        analytics_role: 'status',
        options: {
          choices: [
            { value: 'В работе', color: '#fef9c3' },
            { value: 'Готово', color: '#dcfce7' },
          ],
        },
      },
      { key: 'notes', label: 'Заметки', type: 'note' },
    ],
  },
  {
    id: 'empty',
    title: 'Пустой',
    emoji: '⬜',
    hint: 'Соберу поля сам',
    fields: [],
  },
]

// ── Сводка записи для строки списка (без открытия карточки) ──────────────────
export interface WjRecordSummary {
  title: string
  status: { value: string; color?: string } | null
  checklist: { done: number; total: number } | null
  due: { date: string; overdue: boolean } | null
  money: WjMoney[] // income — для краткой подписи суммы
}

export function recordTitle(values: Record<string, unknown>, fields: WjField[]): string {
  const byRole = fields.find((f) => f.analytics_role === 'client_name')
  const byType = fields.find((f) => f.type === 'text' || f.type === 'phone')
  for (const f of [byRole, byType].filter(Boolean) as WjField[]) {
    const v = values[f.key]
    const arr = parseTextValues(v)
    if (arr.length) return arr[0]
  }
  for (const v of Object.values(values)) {
    const arr = parseTextValues(v)
    if (arr.length) return arr[0]
  }
  return 'Без имени'
}

export function recordSummary(
  values: Record<string, unknown>,
  fields: WjField[],
  today: string,
): WjRecordSummary {
  const title = recordTitle(values, fields)

  const statusField = fields.find((f) => f.type === 'status')
  let status: WjRecordSummary['status'] = null
  if (statusField) {
    const raw = asString(values[statusField.key]).trim()
    if (raw) {
      const choice = getChoices(statusField).find((c) => c.value === raw)
      status = { value: raw, color: choice?.color }
    }
  }

  const checklistField = fields.find((f) => f.type === 'checklist')
  let checklist: WjRecordSummary['checklist'] = null
  if (checklistField) {
    const items = parseChecklist(values[checklistField.key])
    if (items.length) checklist = { done: items.filter((i) => i.done).length, total: items.length }
  }

  // срок: поле date с ролью date_due, иначе первое date-поле
  const dueField =
    fields.find((f) => f.type === 'date' && f.analytics_role === 'date_due') ??
    fields.find((f) => f.type === 'date')
  let due: WjRecordSummary['due'] = null
  if (dueField) {
    const d = parseDate(values[dueField.key])
    if (d) due = { date: d, overdue: d < today }
  }

  const money: WjMoney[] = []
  for (const f of fields) {
    if (f.type !== 'money' || f.money_direction !== 'income') continue
    const m = parseMoney(values[f.key])
    if (m) money.push(m)
  }

  return { title, status, checklist, due, money }
}

// Все ранее введённые значения «на что» (purpose) по проекту — для автоподсказки.
export function collectPurposes(
  records: { values: Record<string, unknown> }[],
  fields: WjField[],
): string[] {
  const moneyKeys = fields.filter((f) => f.type === 'money').map((f) => f.key)
  const set = new Set<string>()
  for (const r of records) {
    for (const k of moneyKeys) {
      for (const m of parseMoneyList(r.values[k])) {
        if (m.purpose) set.add(m.purpose)
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

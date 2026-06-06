// Резолвер «город ↔ IATA» и форматеры дат для модуля «Авиабилеты».
//
// CITY_TO_IATA и resolvePlace — порт 1:1 из бота EasyTicket
// (tickets-bot/handlers/parsing.py), чтобы веб принимал тот же ввод, что и бот:
// либо 3-буквенный IATA-код (TLV), либо имя города (Тель-Авив, Москва).
// Где у Travelpayouts есть метрокод города (вся агломерация) — берётся он
// (MOW, LON, PAR, ROM, MIL, NYC): так ловим все аэропорты города сразу.

// Частые направления: имя (рус/англ, нижний регистр) → IATA-код.
export const CITY_TO_IATA: Record<string, string> = {
  // Израиль
  'тель-авив': 'TLV', тельавив: 'TLV', 'tel-aviv': 'TLV',
  тлв: 'TLV', эйлат: 'ETM', eilat: 'ETM',
  // Россия / СНГ
  москва: 'MOW', moscow: 'MOW',
  петербург: 'LED', 'санкт-петербург': 'LED', спб: 'LED', питер: 'LED',
  тбилиси: 'TBS', tbilisi: 'TBS', батуми: 'BUS', batumi: 'BUS',
  ереван: 'EVN', yerevan: 'EVN', баку: 'GYD', baku: 'GYD',
  // Турция / Ближний Восток
  стамбул: 'IST', istanbul: 'IST', анталья: 'AYT', анталия: 'AYT',
  antalya: 'AYT', дубай: 'DXB', dubai: 'DXB',
  ларнака: 'LCA', larnaca: 'LCA', кипр: 'LCA',
  амман: 'AMM', amman: 'AMM', каир: 'CAI', cairo: 'CAI',
  // Европа
  лондон: 'LON', london: 'LON', париж: 'PAR', paris: 'PAR',
  рим: 'ROM', rome: 'ROM', милан: 'MIL', milan: 'MIL',
  барселона: 'BCN', barcelona: 'BCN', мадрид: 'MAD', madrid: 'MAD',
  афины: 'ATH', athens: 'ATH', вена: 'VIE', vienna: 'VIE',
  прага: 'PRG', prague: 'PRG', будапешт: 'BUD', budapest: 'BUD',
  берлин: 'BER', berlin: 'BER', амстердам: 'AMS', amsterdam: 'AMS',
  лиссабон: 'LIS', lisbon: 'LIS',
  // Дальние
  'нью-йорк': 'NYC', бангкок: 'BKK', bangkok: 'BKK',
}

// Обратная карта IATA → каноничное русское имя (для красивого показа в карточке).
// Берём первое русское название из CITY_TO_IATA с заглавной буквы.
export const IATA_TO_CITY: Record<string, string> = {
  TLV: 'Тель-Авив', ETM: 'Эйлат',
  MOW: 'Москва', LED: 'Санкт-Петербург', TBS: 'Тбилиси', BUS: 'Батуми',
  EVN: 'Ереван', GYD: 'Баку',
  IST: 'Стамбул', AYT: 'Анталья', DXB: 'Дубай', LCA: 'Ларнака',
  AMM: 'Амман', CAI: 'Каир',
  LON: 'Лондон', PAR: 'Париж', ROM: 'Рим', MIL: 'Милан', BCN: 'Барселона',
  MAD: 'Мадрид', ATH: 'Афины', VIE: 'Вена', PRG: 'Прага', BUD: 'Будапешт',
  BER: 'Берлин', AMS: 'Амстердам', LIS: 'Лиссабон',
  NYC: 'Нью-Йорк', JFK: 'Нью-Йорк', BKK: 'Бангкок',
}

/**
 * Вернуть IATA-код по вводу или null, если не распознали.
 * Принимаем либо сам 3-буквенный латинский код (TLV), либо имя города из
 * словаря (Тель-Авив, Москва). Регистр и пробелы по краям не важны.
 */
export function resolvePlace(token: string): string | null {
  const cleaned = token.trim()
  if (cleaned.length === 3 && /^[a-zA-Z]{3}$/.test(cleaned)) {
    return cleaned.toUpperCase()
  }
  return CITY_TO_IATA[cleaned.toLowerCase()] ?? null
}

/** Красивое имя места: «Тель-Авив (TLV)» если город известен, иначе сам код. */
export function placeLabel(iata: string): string {
  const city = IATA_TO_CITY[iata]
  return city ? `${city} (${iata})` : iata
}

const MONTHS_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

/**
 * Человекочитаемая дата маршрута. Поле в БД — это либо «YYYY-MM-DD» (конкретный
 * день), либо «YYYY-MM» (целый месяц). Возвращаем «10 июля 2026» или
 * «весь сентябрь 2026».
 */
export function formatFlightDate(value: string): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dayMatch) {
    const [, , m, d] = dayMatch
    const monthName = MONTHS_RU[Number(m) - 1] ?? m
    const genitive = monthName.replace(/ь$/, 'я').replace(/т$/, 'та').replace(/й$/, 'я')
    return `${Number(d)} ${genitive} ${dayMatch[1]}`
  }
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value)
  if (monthMatch) {
    const monthName = MONTHS_RU[Number(monthMatch[2]) - 1] ?? monthMatch[2]
    return `весь ${monthName} ${monthMatch[1]}`
  }
  return value
}

/** True, если поле даты — режим «целый месяц» (YYYY-MM без дня). */
export function isMonthMode(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

/** IATA-код авиакомпании: 2–3 латинские буквы/цифры (TK, LH, 3F, W4, S7). */
export function looksLikeAirline(token: string): boolean {
  const t = token.trim()
  return t.length >= 2 && t.length <= 3 && /^[a-zA-Z0-9]+$/.test(t)
}

/** Сегодняшняя дата как «YYYY-MM-DD» в локальном времени (для валидации «не в прошлом»). */
export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

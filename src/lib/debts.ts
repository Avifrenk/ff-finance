// Расчёт долгов между супругами.
//
// «Общая трата» = expense на shared-счёте, не приватная, не часть transfer'а.
// Каждая общая трата делится 50/50. Settlement (transfer с is_debt_settlement=
// true) компенсирует накопленный долг.
//
// Все суммы — в base_currency семьи через convertMoney. Если курса на дату
// операции нет — операция пропускается, флаг missingRate = true.
//
// Приватность: операция с is_private=true — это «потрачено из общего кошелька
// на личную нужду» (подарок, что-то для себя). В долг она НЕ идёт у никого:
// автор сам решил, что это его личное, а не общее. Партнёр такую операцию
// через RLS вообще не видит. У обеих сторон расчёт долга одинаковый — потому
// что приватные везде отсечены клиентским фильтром.

import type { Operation } from '../hooks/useOperations'
import type { Account } from '../hooks/useAccounts'
import type { RatesByDate } from './fx'
import { convertMoney } from './fx'

export interface DebtTransferLike {
  id: string
  from_account_id: string
  to_account_id: string
  amount: number
  occurred_at: string
  is_debt_settlement: boolean
}

export interface MemberLike {
  profile_id: string
  display_name: string | null
}

export interface DebtBalances {
  /** Сколько каждый профиль «положил больше, чем должен был» в общий бюджет, в base_currency. */
  byProfileId: Map<string, number>
  missingRate: boolean
  missingCount: number
}

// ---------------------------------------------------------------------------
// 1. Накопленные «paid» по партнёрам
// ---------------------------------------------------------------------------
// Алгоритм:
//   * Для каждой expense на shared-счёте, !is_private, transfer_id is null:
//     paid[author] += amount_in_base.
//   * Для каждого transfer с is_debt_settlement=true, оба счёта personal,
//     owner'ы разные: paid[from_owner] += amount_in_base (отправитель
//     уже погасил часть долга), paid[to_owner] -= amount_in_base.
//
// На выходе byProfileId — «сколько Х суммарно вложил в общий бюджет, с
// учётом уже выполненных settlement'ов».
export function computeDebtBalances(
  operations: Operation[],
  accountById: Map<string, Account>,
  transfers: DebtTransferLike[],
  baseCurrency: string,
  ratesByDate: RatesByDate,
): DebtBalances {
  const byProfileId = new Map<string, number>()
  let missingCount = 0

  const add = (profileId: string, delta: number) => {
    byProfileId.set(profileId, (byProfileId.get(profileId) ?? 0) + delta)
  }

  // 1. Общие траты.
  for (const op of operations) {
    if (op.kind !== 'expense') continue
    if (op.is_private) continue
    if (op.transfer_id !== null) continue
    const account = accountById.get(op.account_id)
    if (!account) continue
    if (account.visibility !== 'shared') continue
    const amount = Number(op.amount)
    if (account.currency === baseCurrency) {
      add(op.author_profile_id, amount)
      continue
    }
    const conv = convertMoney(amount, account.currency, baseCurrency, ratesByDate, op.occurred_at)
    if (conv === null) {
      missingCount += 1
      continue
    }
    add(op.author_profile_id, conv)
  }

  // 2. Settlement'ы.
  for (const tr of transfers) {
    if (!tr.is_debt_settlement) continue
    const fromAcc = accountById.get(tr.from_account_id)
    const toAcc = accountById.get(tr.to_account_id)
    if (!fromAcc || !toAcc) continue
    if (fromAcc.visibility !== 'personal' || toAcc.visibility !== 'personal') continue
    if (fromAcc.owner_profile_id === toAcc.owner_profile_id) continue

    const amount = Number(tr.amount)
    let inBase: number | null
    if (fromAcc.currency === baseCurrency) {
      inBase = amount
    } else {
      inBase = convertMoney(amount, fromAcc.currency, baseCurrency, ratesByDate, tr.occurred_at)
    }
    if (inBase === null) {
      missingCount += 1
      continue
    }
    add(fromAcc.owner_profile_id, inBase)
    add(toAcc.owner_profile_id, -inBase)
  }

  return { byProfileId, missingRate: missingCount > 0, missingCount }
}

// ---------------------------------------------------------------------------
// 2. Сводка «кто кому должен»
// ---------------------------------------------------------------------------
// Работает только для household с двумя партнёрами (MVP). N>2 — отдельная фича.
//
// Дельта = paid[A] - paid[B]. Если |Δ| < 0.01 — null («ровно»).
// Если Δ > 0 — A заплатил больше → B должен A половину разницы.
// amount = |Δ| / 2.

export interface DebtSummary {
  fromProfileId: string
  toProfileId: string
  fromName: string
  toName: string
  amount: number
}

const NEAR_ZERO = 0.01

export function summarizeDebts(
  balances: DebtBalances,
  members: MemberLike[],
): DebtSummary | null {
  if (members.length !== 2) return null
  const [a, b] = members
  const paidA = balances.byProfileId.get(a.profile_id) ?? 0
  const paidB = balances.byProfileId.get(b.profile_id) ?? 0
  const delta = paidA - paidB
  if (Math.abs(delta) < NEAR_ZERO) return null
  const amount = Math.abs(delta) / 2

  // Δ > 0: A заплатил больше → B должен A.
  // Δ < 0: B заплатил больше → A должен B.
  if (delta > 0) {
    return {
      fromProfileId: b.profile_id,
      toProfileId: a.profile_id,
      fromName: b.display_name ?? 'Партнёр',
      toName: a.display_name ?? 'Партнёр',
      amount,
    }
  }
  return {
    fromProfileId: a.profile_id,
    toProfileId: b.profile_id,
    fromName: a.display_name ?? 'Партнёр',
    toName: b.display_name ?? 'Партнёр',
    amount,
  }
}

// ---------------------------------------------------------------------------
// 3. Расходы по автору за период (для секции «откуда долг» на /debts)
// ---------------------------------------------------------------------------
// Возвращает Map<profileId, amountInBase> — сколько каждый автор потратил
// «на общее» за заданный период.

export interface RangeFilter {
  from: string // ISO date YYYY-MM-DD
  to: string
}

export function expensesByAuthorInRange(
  operations: Operation[],
  accountById: Map<string, Account>,
  baseCurrency: string,
  ratesByDate: RatesByDate,
  range: RangeFilter,
): { byProfileId: Map<string, number>; missingCount: number } {
  const byProfileId = new Map<string, number>()
  let missingCount = 0
  for (const op of operations) {
    if (op.kind !== 'expense') continue
    if (op.is_private) continue
    if (op.transfer_id !== null) continue
    if (op.occurred_at < range.from || op.occurred_at > range.to) continue
    const account = accountById.get(op.account_id)
    if (!account || account.visibility !== 'shared') continue
    const amount = Number(op.amount)
    let inBase: number | null
    if (account.currency === baseCurrency) {
      inBase = amount
    } else {
      inBase = convertMoney(amount, account.currency, baseCurrency, ratesByDate, op.occurred_at)
    }
    if (inBase === null) {
      missingCount += 1
      continue
    }
    byProfileId.set(op.author_profile_id, (byProfileId.get(op.author_profile_id) ?? 0) + inBase)
  }
  return { byProfileId, missingCount }
}

// Примеры (для самодокументирования):
//   * Алиса 1000₪ за продукты на shared, Боб 800₪ за арнону на shared,
//     2 партнёра → paid[A]=1000, paid[B]=800, Δ=200, amount=100 →
//     «Боб должен Алисе 100₪».
//   * Settlement 100₪ из Б.personal → А.personal с is_debt_settlement=true:
//     paid[B]+=100, paid[A]-=100 → Δ становится 0 → null.
//   * Кросс-валюта: shared-EUR счёт, expense 100€ при курсе 4.0 → 400₪ → paid[author]+=400.
//   * Курса нет → операция пропущена, missingCount += 1.

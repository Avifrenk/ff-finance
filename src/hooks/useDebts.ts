import { useMemo } from 'react'
import { useApp } from '../contexts/useApp'
import { useAccounts } from './useAccounts'
import { useOperations } from './useOperations'
import { useTransfers } from './useTransfers'
import { useFxRates } from './useFxRates'
import { computeDebtBalances, summarizeDebts, type MemberLike } from '../lib/debts'

export function useDebts() {
  const { household, members } = useApp()
  const baseCurrency = household?.base_currency ?? 'ILS'
  const { accounts } = useAccounts()
  const { operations, loading: opsLoading } = useOperations('all')
  const { transfers, loading: trLoading } = useTransfers()
  const { ratesByDate, loading: fxLoading } = useFxRates()

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const balances = useMemo(
    () =>
      computeDebtBalances(
        operations,
        accountById,
        transfers,
        baseCurrency,
        ratesByDate,
      ),
    [operations, accountById, transfers, baseCurrency, ratesByDate],
  )

  // members в context'е содержит owner и партнёра (если он принял invite).
  // Сводка работает только при двух участниках.
  const memberLikes: MemberLike[] = useMemo(
    () =>
      members.map((m) => ({
        profile_id: m.profile_id,
        display_name: m.display_name,
      })),
    [members],
  )

  const summary = useMemo(() => summarizeDebts(balances, memberLikes), [balances, memberLikes])

  return {
    summary,
    balances,
    members: memberLikes,
    loading: opsLoading || trLoading || fxLoading,
  }
}

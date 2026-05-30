import { useEffect, useState, type FormEvent } from 'react'
import { useCryptoCoins } from '../hooks/useCryptoCoins'
import { useCryptoHoldings } from '../hooks/useCryptoHoldings'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
}

export function NewHoldingDialog({ open, onClose }: Props) {
  const { coins, loading: coinsLoading } = useCryptoCoins()
  const { holdings, create } = useCryptoHoldings()

  const [coinId, setCoinId] = useState('')
  const [custodian, setCustodian] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect --
     form-reset при открытии диалога. */
  useEffect(() => {
    if (!open) return
    setCoinId(coins[0]?.id ?? '')
    setCustodian('')
    setError(null)
  }, [open, coins])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  const existingCustodians = Array.from(new Set(holdings.map((h) => h.custodian))).sort()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!coinId) {
      setError('Выберите монету')
      return
    }
    const trimmed = custodian.trim()
    if (!trimmed) {
      setError('Укажите биржу или кошелёк')
      return
    }
    setBusy(true)
    try {
      await create({ coinId, custodian: trimmed })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать холдинг')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Новый холдинг</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Монета
            </label>
            <select
              value={coinId}
              onChange={(e) => setCoinId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors"
              disabled={coinsLoading}
            >
              {coinsLoading && <option value="">Загрузка…</option>}
              {coins.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}
                  {c.symbol} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Биржа или кошелёк
            </label>
            <AuthInput
              type="text"
              list="ff-custodians"
              placeholder="Binance, Trezor, MetaMask…"
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
              required
              autoFocus
            />
            {existingCustodians.length > 0 && (
              <datalist id="ff-custodians">
                {existingCustodians.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Свободный текст. Удобно использовать одинаковые названия, чтобы суммировать монеты по биржам.
            </p>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Создаём…' : 'Создать холдинг'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

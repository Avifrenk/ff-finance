import { useState, type FormEvent } from 'react'
import { useApp } from '../contexts/useApp'
import { useAccounts, type Account } from '../hooks/useAccounts'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'
import { formatMoney } from '../lib/format'

export function Settings() {
  const { profile, household, members, viewMode, signOut } = useApp()
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">⚙️ Настройки</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : (household?.name ?? '')}
        </h1>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5 space-y-2 text-sm">
        <Row label="Имя">{profile?.display_name ?? '—'}</Row>
        <Row label="Локаль">{profile?.locale ?? '—'}</Row>
        <Row label="Семья">{household?.name ?? '—'}</Row>
        <Row label="Участников">{members.length}</Row>
      </section>

      <AccountsSection />

      <button
        onClick={() => signOut()}
        className="text-sm text-rose-600 dark:text-rose-400 hover:underline"
      >
        Выйти из аккаунта
      </button>
    </div>
  )
}

function AccountsSection() {
  const { profile } = useApp()
  const { accounts, loading, error, create, remove } = useAccounts()
  const [adding, setAdding] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  async function handleDelete(account: Account) {
    setRemoveError(null)
    if (!window.confirm(`Удалить счёт «${account.name}»? Если у него есть операции — Postgres откажет.`)) {
      return
    }
    try {
      await remove(account.id)
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Счета</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Добавить
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && accounts.length === 0 && !adding && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Пока нет ни одного счёта. Добавьте первый — наличные, карту или семейный — чтобы начать вести учёт.
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 -my-2">
          {accounts.map((a) => (
            <li key={a.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{a.visibility === 'shared' ? '🏠' : '🧍'}</span>
                  <span>{a.name}</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {a.visibility === 'shared' ? 'Семейный' : 'Личный'} ·{' '}
                  Начальный баланс {formatMoney(a.initial_balance, a.currency)}
                </div>
              </div>
              {a.owner_profile_id === profile?.id && (
                <button
                  onClick={() => handleDelete(a)}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {removeError && (
        <div className="mt-3">
          <ErrorBox>{removeError}</ErrorBox>
        </div>
      )}

      {adding && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <AddAccountForm onDone={() => setAdding(false)} create={create} />
        </div>
      )}
    </section>
  )
}

function AddAccountForm({
  onDone,
  create,
}: {
  onDone: () => void
  create: (input: {
    name: string
    visibility: 'personal' | 'shared'
    initial_balance: number
  }) => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<'personal' | 'shared'>('personal')
  const [initialBalance, setInitialBalance] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await create({
        name: name.trim(),
        visibility,
        initial_balance: Number(initialBalance) || 0,
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Название
        </label>
        <AuthInput
          type="text"
          placeholder="Hapoalim, Наличные, Револют…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Тип</label>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
          <VisibilityButton
            active={visibility === 'personal'}
            onClick={() => setVisibility('personal')}
          >
            🧍 Личный
          </VisibilityButton>
          <VisibilityButton
            active={visibility === 'shared'}
            onClick={() => setVisibility('shared')}
          >
            🏠 Семейный
          </VisibilityButton>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {visibility === 'personal'
            ? 'Видите только вы. Партнёр не узнает ни о счёте, ни об операциях на нём.'
            : 'Видят оба партнёра. Операции тоже видны обоим (если не отметить операцию как приватную).'}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
          Начальный баланс
        </label>
        <AuthInput
          type="number"
          step="0.01"
          value={initialBalance}
          onChange={(e) => setInitialBalance(e.target.value)}
          required
        />
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={onDone}>
          Отмена
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Сохраняем…' : 'Создать'}
        </PrimaryButton>
      </div>
    </form>
  )
}

function VisibilityButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-900 dark:text-slate-100">{children}</span>
    </div>
  )
}

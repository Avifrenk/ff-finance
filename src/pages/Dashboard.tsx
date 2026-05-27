import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'

export function Dashboard() {
  const { household, members, viewMode, profile, refresh } = useApp()
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!household) return null

  const isOwner = household.owner_id === profile?.id
  const partnerJoined = members.some((m) => m.role === 'partner')

  async function createInvite() {
    setInviteError(null)
    setBusy(true)
    const { data, error } = await supabase
      .from('household_invites')
      .insert({ household_id: household!.id })
      .select('token')
      .single()
    setBusy(false)
    if (error || !data) {
      setInviteError(error?.message ?? 'Не удалось создать приглашение')
      return
    }
    setInviteUrl(`${window.location.origin}/invite/${data.token}`)
    await refresh()
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {viewMode === 'personal' ? '🧍 Личный кабинет' : '🏠 Семейный кабинет'}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : household.name}
        </h1>
      </header>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Участники семьи</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.profile_id} className="flex items-center gap-3 text-sm">
              <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-medium">
                {(m.display_name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-slate-900 dark:text-slate-100">
                  {m.display_name ?? '(без имени)'}
                  {m.profile_id === profile?.id && (
                    <span className="ml-2 text-xs text-slate-400">— это вы</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {m.role === 'owner' ? 'Создатель семьи' : 'Партнёр'}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {isOwner && !partnerJoined && (
          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
              Партнёр ещё не присоединился. Сгенерируйте ссылку-приглашение и пришлите ей/ему любым удобным способом.
            </p>
            {!inviteUrl ? (
              <PrimaryButton onClick={createInvite} disabled={busy}>
                {busy ? 'Создаём…' : 'Сгенерировать приглашение'}
              </PrimaryButton>
            ) : (
              <InviteLink url={inviteUrl} onRegenerate={() => setInviteUrl(null)} />
            )}
            {inviteError && (
              <div className="mt-3">
                <ErrorBox>{inviteError}</ErrorBox>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-transparent p-5 text-sm text-slate-500 dark:text-slate-400">
        Финансовая аналитика появится в Фазе 3. Сейчас вы на этапе авторизации и кабинетов (Фаза 1).
      </section>
    </div>
  )
}

function InviteLink({ url, onRegenerate }: { url: string; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-2">
      <div className="font-mono text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 break-all">
        {url}
      </div>
      <div className="flex gap-2">
        <PrimaryButton onClick={copy}>{copied ? 'Скопировано ✓' : 'Скопировать ссылку'}</PrimaryButton>
        <SecondaryButton onClick={onRegenerate}>Сгенерировать новую</SecondaryButton>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Ссылка действует 7 дней.</p>
    </div>
  )
}

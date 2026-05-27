import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from '../components/AuthControls'

type Mode = 'choose' | 'create' | 'accept'

export function Onboarding() {
  const { household, refresh, signOut, profile } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => (searchParams.get('mode') === 'accept' ? 'accept' : 'choose'))

  if (household) {
    navigate('/', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white/80 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Привет{profile?.display_name ? `, ${profile.display_name}` : ''}!
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Чтобы начать, нужно завести «семью» — или принять приглашение от партнёра.
          </p>
        </div>

        {mode === 'choose' && <ChooseMode onCreate={() => setMode('create')} onAccept={() => setMode('accept')} />}
        {mode === 'create' && <CreateHousehold onDone={refresh} onBack={() => setMode('choose')} />}
        {mode === 'accept' && (
          <AcceptInvite
            onDone={refresh}
            onBack={() => setMode('choose')}
            initialToken={searchParams.get('token') ?? ''}
          />
        )}

        <button
          onClick={() => signOut()}
          className="mt-6 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  )
}

function ChooseMode({ onCreate, onAccept }: { onCreate: () => void; onAccept: () => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Card
        emoji="🏠"
        title="Создать семью"
        description="Я первый. Заведу семью и потом приглашу партнёра."
        onClick={onCreate}
      />
      <Card
        emoji="✉️"
        title="У меня приглашение"
        description="Партнёр уже создал семью и прислал мне ссылку."
        onClick={onAccept}
      />
    </div>
  )
}

function Card({
  emoji,
  title,
  description,
  onClick,
}: {
  emoji: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
    >
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</div>
    </button>
  )
}

function CreateHousehold({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const { data: userRes } = await supabase.auth.getUser()
    const userId = userRes.user?.id
    if (!userId) {
      setError('Сессия истекла. Войдите заново.')
      setBusy(false)
      return
    }

    const { data: createdHousehold, error: createErr } = await supabase
      .from('households')
      .insert({ name: name.trim(), owner_id: userId })
      .select('id')
      .single()

    if (createErr || !createdHousehold) {
      setError(createErr?.message ?? 'Не удалось создать семью')
      setBusy(false)
      return
    }

    const { error: memberErr } = await supabase
      .from('household_members')
      .insert({ household_id: createdHousehold.id, profile_id: userId, role: 'owner' })

    if (memberErr) {
      setError(memberErr.message)
      setBusy(false)
      return
    }

    await onDone()
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Название семьи</label>
      <AuthInput
        type="text"
        placeholder="Frenkel"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={onBack}>
          Назад
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Создаём…' : 'Создать'}
        </PrimaryButton>
      </div>
    </form>
  )
}

function AcceptInvite({
  onDone,
  onBack,
  initialToken,
}: {
  onDone: () => Promise<void>
  onBack: () => void
  initialToken: string
}) {
  const [token, setToken] = useState(initialToken)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const cleanToken = extractToken(token)
    const { error: rpcErr } = await supabase.rpc('accept_invite', { invite_token: cleanToken })

    if (rpcErr) {
      setError(humaniseInviteError(rpcErr.message))
      setBusy(false)
      return
    }

    await onDone()
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Приглашение</label>
      <AuthInput
        type="text"
        placeholder="вставьте ссылку или только токен"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
        autoFocus
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Можно вставить полную ссылку вида <code className="font-mono">…/invite/&lt;токен&gt;</code> — мы сами достанем токен.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <SecondaryButton type="button" onClick={onBack}>
          Назад
        </SecondaryButton>
        <PrimaryButton type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Принимаем…' : 'Принять'}
        </PrimaryButton>
      </div>
    </form>
  )
}

function extractToken(input: string): string {
  const trimmed = input.trim()
  // Поддержка вставки полного URL вида http://host/invite/<token>?...
  const match = trimmed.match(/\/invite\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : trimmed
}

function humaniseInviteError(raw: string): string {
  if (raw.includes('INVITE_NOT_FOUND')) return 'Приглашение не найдено. Проверьте токен.'
  if (raw.includes('INVITE_ALREADY_ACCEPTED')) return 'Это приглашение уже использовано.'
  if (raw.includes('INVITE_EXPIRED')) return 'Срок действия приглашения истёк. Попросите партнёра выслать новое.'
  if (raw.includes('ALREADY_IN_ANOTHER_HOUSEHOLD'))
    return 'Вы уже состоите в другой семье. Сначала нужно из неё выйти.'
  return raw
}

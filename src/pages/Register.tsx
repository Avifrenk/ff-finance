import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthCard, AuthInput, ErrorBox, GoogleButton, PrimaryButton } from '../components/AuthControls'

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  const afterAuthPath = inviteToken
    ? `/onboarding?mode=accept&token=${encodeURIComponent(inviteToken)}`
    : '/'

  async function handleEmailRegister(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || null },
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Если включена email confirmation — session=null, надо ждать письма.
    if (!data.session) {
      setConfirmSent(true)
      return
    }
    navigate(afterAuthPath, { replace: true })
  }

  async function handleGoogle() {
    setError(null)
    const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL}`
    const redirectTo = inviteToken
      ? `${baseUrl}auth/callback?invite=${encodeURIComponent(inviteToken)}`
      : `${baseUrl}auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) setError(error.message)
  }

  if (confirmSent) {
    return (
      <AuthCard title="Проверьте почту" subtitle="Мы отправили письмо для подтверждения">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Перейдите по ссылке из письма, чтобы завершить регистрацию. После подтверждения вернитесь сюда и войдите.
        </p>
        <p className="mt-4 text-center">
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            ← На страницу входа
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Регистрация" subtitle="Создайте аккаунт для семейного учёта">
      <form onSubmit={handleEmailRegister} className="space-y-3">
        <AuthInput
          type="text"
          placeholder="Имя (необязательно)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <AuthInput
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <AuthInput
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
        {error && <ErrorBox>{error}</ErrorBox>}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать аккаунт'}
        </PrimaryButton>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        или
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      <GoogleButton onClick={handleGoogle} />

      <p className="mt-6 text-sm text-center text-slate-500 dark:text-slate-400">
        Уже есть аккаунт?{' '}
        <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Войти
        </Link>
      </p>
    </AuthCard>
  )
}

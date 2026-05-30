import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/useApp'
import { AuthCard, AuthInput, GoogleButton, PrimaryButton, ErrorBox } from '../components/AuthControls'

export function Login() {
  const { status } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  if (status === 'authenticated') {
    navigate(from, { replace: true })
  }

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(from, { replace: true })
  }

  async function handleGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <AuthCard title="Вход" subtitle="Войдите, чтобы открыть свой кабинет">
      <form onSubmit={handleEmailLogin} className="space-y-3">
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
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <ErrorBox>{error}</ErrorBox>}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </PrimaryButton>
      </form>

      <Divider />

      <GoogleButton onClick={handleGoogle} />

      <p className="mt-6 text-sm text-center text-slate-500 dark:text-slate-400">
        Ещё нет аккаунта?{' '}
        <Link to="/register" className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Регистрация
        </Link>
      </p>
    </AuthCard>
  )
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      или
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

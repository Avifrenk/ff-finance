import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../contexts/useApp'

export function Invite() {
  const { token } = useParams<{ token: string }>()
  const { status, household } = useApp()

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
        Загрузка…
      </div>
    )
  }

  if (status === 'anonymous') {
    // Не авторизован — отправляем на регистрацию, токен передаём в query,
    // чтобы после регистрации мы вернулись и приняли приглашение.
    return <Navigate to={`/register?invite=${encodeURIComponent(token ?? '')}`} replace />
  }

  if (household) {
    // Уже в семье — приглашение уже не актуально.
    return <Navigate to="/" replace />
  }

  // Авторизован, без household — на онбординг с уже заполненным токеном.
  return <Navigate to={`/onboarding?mode=accept&token=${encodeURIComponent(token ?? '')}`} replace />
}

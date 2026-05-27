import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/useApp'

export function AuthCallback() {
  const navigate = useNavigate()
  const { status } = useApp()

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/', { replace: true })
    } else if (status === 'anonymous') {
      navigate('/login?error=oauth_failed', { replace: true })
    }
  }, [status, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
      Подтверждаем вход…
    </div>
  )
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '../contexts/useApp'

export function RequireAuth() {
  const { status } = useApp()
  const location = useLocation()

  if (status === 'loading') {
    return <Splash />
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 dark:text-slate-400">
      Загрузка…
    </div>
  )
}

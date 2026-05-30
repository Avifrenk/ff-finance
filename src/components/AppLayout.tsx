import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp, type ViewMode } from '../contexts/useApp'
import { AddOperationDialog } from './AddOperationDialog'

export function AppLayout() {
  const { household, viewMode, setViewMode, profile, signOut } = useApp()
  const location = useLocation()
  const [addOpen, setAddOpen] = useState(false)

  // Нет household — гнать в онбординг (кроме страниц самого онбординга и invite).
  if (!household && !location.pathname.startsWith('/onboarding') && !location.pathname.startsWith('/invite')) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="h-7 w-7 rounded-lg bg-indigo-500 text-white flex items-center justify-center text-sm">
              ₪
            </span>
            <span className="text-slate-900 dark:text-slate-100">FF Finance</span>
          </Link>

          {household && (
            <ViewModeSwitcher
              viewMode={viewMode}
              setViewMode={setViewMode}
              householdName={household.name}
              personalName={profile?.display_name ?? 'Я'}
            />
          )}

          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavItem to="/">Дашборд</NavItem>
            <NavItem to="/operations">Операции</NavItem>
            <NavItem to="/goals">Цели</NavItem>
            <NavItem to="/settings">Настройки</NavItem>
            <button
              onClick={() => signOut()}
              className="ml-2 px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Выйти
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24">
        <Outlet />
      </main>

      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-2xl shadow-lg shadow-indigo-500/30 transition-colors flex items-center justify-center"
        aria-label="Добавить операцию"
      >
        +
      </button>

      <AddOperationDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md transition-colors ${
          isActive
            ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function ViewModeSwitcher({
  viewMode,
  setViewMode,
  householdName,
  personalName,
}: {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  householdName: string
  personalName: string
}) {
  return (
    <div className="ml-2 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60">
      <SwitcherButton active={viewMode === 'personal'} onClick={() => setViewMode('personal')}>
        🧍 {personalName}
      </SwitcherButton>
      <SwitcherButton active={viewMode === 'household'} onClick={() => setViewMode('household')}>
        🏠 {householdName}
      </SwitcherButton>
    </div>
  )
}

function SwitcherButton({
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

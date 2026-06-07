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
      <header
        className="border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold shrink-0">
            <span className="h-8 w-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center text-base">
              ₪
            </span>
            <span className="text-slate-900 dark:text-slate-100 hidden sm:inline">FF Finance</span>
          </Link>

          {household && (
            <ViewModeSwitcher
              viewMode={viewMode}
              setViewMode={setViewMode}
              householdName={household.name}
              personalName={profile?.display_name ?? 'Я'}
            />
          )}

          {/* Десктоп: nav в шапке */}
          <nav className="ml-auto hidden md:flex items-center gap-1 text-sm">
            <NavItem to="/" icon="📊" label="Дашборд" />
            <NavItem to="/operations" icon="📝" label="Операции" />
            <NavItem to="/scan" icon="📸" label="Сканер" />
            <NavItem to="/assistant" icon="💬" label="Финик" />
            <NavItem to="/shopping" icon="🛒" label="Покупки" />
            <NavItem to="/goals" icon="🎯" label="Цели" />
            <NavItem to="/crypto" icon="🪙" label="Крипта" />
            <NavItem to="/debts" icon="🤝" label="Долги" />
            <NavItem to="/flights" icon="✈️" label="Билеты" />
            <NavItem to="/journal" icon="🗂" label="Дела" end={false} />
            <NavItem to="/settings" icon="⚙️" label="Настройки" />
            <button
              onClick={() => signOut()}
              className="ml-2 px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Выйти
            </button>
          </nav>

          {/* Мобайл: только выйти в шапке (nav внизу) */}
          <button
            onClick={() => signOut()}
            aria-label="Выйти"
            title="Выйти"
            className="md:hidden ml-auto p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="text-xl leading-none">🚪</span>
          </button>
        </div>
      </header>

      <main
        className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-32 md:pb-12"
        style={{ paddingBottom: 'max(8rem, calc(env(safe-area-inset-bottom) + 7rem))' }}
      >
        <Outlet />
      </main>

      {/* Bottom tab bar — только на мобайле */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div
          className="flex gap-0.5 px-2 py-1.5 overflow-x-auto snap-x snap-mandatory scroll-px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabItem to="/" icon="📊" label="Дашборд" />
          <TabItem to="/operations" icon="📝" label="Операции" />
          <TabItem to="/scan" icon="📸" label="Сканер" />
          <TabItem to="/assistant" icon="💬" label="Финик" />
          <TabItem to="/shopping" icon="🛒" label="Покупки" />
          <TabItem to="/goals" icon="🎯" label="Цели" />
          <TabItem to="/crypto" icon="🪙" label="Крипта" />
          <TabItem to="/debts" icon="🤝" label="Долги" />
          <TabItem to="/flights" icon="✈️" label="Билеты" />
          <TabItem to="/journal" icon="🗂" label="Дела" end={false} />
          <TabItem to="/settings" icon="⚙️" label="Настройки" />
        </div>
      </nav>

      <button
        onClick={() => setAddOpen(true)}
        className="fixed right-5 h-14 w-14 rounded-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-3xl shadow-lg shadow-indigo-500/30 transition-colors flex items-center justify-center z-50"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
        aria-label="Добавить операцию"
      >
        +
      </button>

      <AddOperationDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function TabItem({ to, icon, label, end = true }: { to: string; icon: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `shrink-0 snap-start flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[64px] rounded-md transition-colors ${
          isActive
            ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10'
            : 'text-slate-500 dark:text-slate-400'
        }`
      }
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span className="text-[11px] leading-tight font-medium whitespace-nowrap">{label}</span>
    </NavLink>
  )
}

function NavItem({ to, icon, label, end = true }: { to: string; icon: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
          isActive
            ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
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
    <div className="ml-1 sm:ml-2 inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100/60 dark:bg-slate-800/60 shrink-0">
      <SwitcherButton
        active={viewMode === 'personal'}
        onClick={() => setViewMode('personal')}
        ariaLabel={`Личный кабинет: ${personalName}`}
      >
        <span aria-hidden>🧍</span>
        <span className="hidden sm:inline ml-1">{personalName}</span>
      </SwitcherButton>
      <SwitcherButton
        active={viewMode === 'household'}
        onClick={() => setViewMode('household')}
        ariaLabel={`Семейный кабинет: ${householdName}`}
      >
        <span aria-hidden>🏠</span>
        <span className="hidden sm:inline ml-1">{householdName}</span>
      </SwitcherButton>
    </div>
  )
}

function SwitcherButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`px-2 sm:px-3 py-1 text-xs rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

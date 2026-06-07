import { NavLink, Outlet } from 'react-router-dom'

// Каркас модуля «Дела» (work-journal). Один вход в навигации FF, внутри — свои
// под-табы «Задачи · Проекты» (решение владельца: без 10-го пункта в таббаре).
// Реальные экраны наполняются в Фазах 4–6; здесь — оболочка + под-навигация.
export function Journal() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          🗂 Дела
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Задачи на день и проекты с записями — в одном месте.
        </p>
      </header>

      <nav className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-100/60 dark:bg-slate-800/60">
        <SubTab to="/journal" icon="✅" label="Задачи" end />
        <SubTab to="/journal/projects" icon="🗂" label="Проекты" />
      </nav>

      <Outlet />
    </div>
  )
}

function SubTab({
  to,
  icon,
  label,
  end = false,
}: {
  to: string
  icon: string
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors ${
          isActive
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`
      }
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

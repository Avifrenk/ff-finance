function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white text-xl font-bold">
            ₪
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Frenkel Family Finance
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Семейный финтрекер · MVP
            </p>
          </div>
        </div>

        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p>
            Каркас приложения собран. Стек:{' '}
            <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              Vite + React + TypeScript + Tailwind + PWA + Supabase
            </span>
          </p>
          <ul className="space-y-2 text-sm">
            <Status ok label="Vite + React 19 + TypeScript" />
            <Status ok label="Tailwind v4 (через @tailwindcss/vite)" />
            <Status ok label="PWA (vite-plugin-pwa) — manifest настроен" />
            <Status ok label="Supabase client готов" />
            <Status label="Supabase ENV (.env.local нужно заполнить)" />
            <Status label="Схема БД (следующий шаг)" />
            <Status label="Авторизация" />
          </ul>
        </div>

        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          Следующий шаг: создать Supabase-проект, заполнить{' '}
          <code className="font-mono">.env.local</code>, спроектировать таблицы.
        </p>
      </div>
    </div>
  )
}

function Status({ ok = false, label }: { ok?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          ok
            ? 'inline-block h-2 w-2 rounded-full bg-emerald-500'
            : 'inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600'
        }
      />
      <span className={ok ? '' : 'text-slate-500 dark:text-slate-400'}>{label}</span>
    </li>
  )
}

export default App

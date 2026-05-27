import { useApp } from '../contexts/useApp'

export function Settings() {
  const { profile, household, members, viewMode, signOut } = useApp()
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">⚙️ Настройки</div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
          {viewMode === 'personal' ? (profile?.display_name ?? 'Я') : (household?.name ?? '')}
        </h1>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5 space-y-2 text-sm">
        <Row label="Имя">{profile?.display_name ?? '—'}</Row>
        <Row label="Локаль">{profile?.locale ?? '—'}</Row>
        <Row label="Семья">{household?.name ?? '—'}</Row>
        <Row label="Участников">{members.length}</Row>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-sm text-slate-500 dark:text-slate-400">
        Расширенные настройки (валюта по умолчанию, категории, удаление аккаунта) — в следующих фазах.
      </section>

      <button
        onClick={() => signOut()}
        className="text-sm text-rose-600 dark:text-rose-400 hover:underline"
      >
        Выйти из аккаунта
      </button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-900 dark:text-slate-100">{children}</span>
    </div>
  )
}

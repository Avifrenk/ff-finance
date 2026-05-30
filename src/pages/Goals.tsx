import { useMemo, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { useGoals, type Goal } from '../hooks/useGoals'
import { useGoalContributions } from '../hooks/useGoalContributions'
import { GoalCard } from '../components/GoalCard'
import { GoalDialog } from '../components/GoalDialog'
import { ContributeDialog } from '../components/ContributeDialog'
import { PrimaryButton } from '../components/AuthControls'

export function Goals() {
  const { household, profile } = useApp()
  const { goals, loading, setArchived, remove } = useGoals({ includeArchived: true })
  const { contributions } = useGoalContributions()
  const baseCurrency = household?.base_currency ?? 'ILS'

  const [createOpen, setCreateOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null)

  const [active, archived] = useMemo(() => {
    const a: Goal[] = []
    const z: Goal[] = []
    for (const g of goals) (g.is_archived ? z : a).push(g)
    return [a, z]
  }, [goals])

  if (!household) return null

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Цели</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Отпуск, первый взнос, чёрный день — копим вместе или каждый сам.
          </p>
        </div>
        <PrimaryButton onClick={() => setCreateOpen(true)}>+ Новая цель</PrimaryButton>
      </header>

      {loading && active.length === 0 && archived.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
      )}

      {!loading && active.length === 0 && archived.length === 0 && (
        <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Пока ни одной цели. Создайте первую — увидите прогресс-бар, оставшуюся сумму
            и оценку, когда дойдёте.
          </p>
          <PrimaryButton onClick={() => setCreateOpen(true)}>+ Новая цель</PrimaryButton>
        </section>
      )}

      <div className="space-y-4">
        {active.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            contributions={contributions}
            baseCurrency={baseCurrency}
            isOwner={g.owner_profile_id === profile?.id}
            onContribute={() => setContributeGoal(g)}
            onEdit={() => setEditGoal(g)}
            onArchive={() => setArchived(g.id, true)}
            onDelete={async () => {
              if (confirm(`Удалить цель «${g.name}»? История пополнений тоже удалится.`)) {
                await remove(g.id)
              }
            }}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <details className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Достигнутые ({archived.length})
          </summary>
          <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
            {archived.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                contributions={contributions}
                baseCurrency={baseCurrency}
                isOwner={g.owner_profile_id === profile?.id}
                onContribute={() => setContributeGoal(g)}
                onEdit={() => setEditGoal(g)}
                onArchive={() => setArchived(g.id, false)}
                onDelete={async () => {
                  if (confirm(`Удалить цель «${g.name}»? История пополнений тоже удалится.`)) {
                    await remove(g.id)
                  }
                }}
              />
            ))}
          </div>
        </details>
      )}

      <GoalDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <GoalDialog
        open={editGoal !== null}
        onClose={() => setEditGoal(null)}
        goal={editGoal ?? undefined}
      />
      <ContributeDialog
        open={contributeGoal !== null}
        onClose={() => setContributeGoal(null)}
        goal={contributeGoal ?? undefined}
        baseCurrency={baseCurrency}
      />
    </div>
  )
}

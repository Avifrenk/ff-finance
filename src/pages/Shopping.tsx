import { useCallback, useRef, useState } from 'react'
import { useShoppingList, type ShoppingItem } from '../hooks/useShoppingList'
import { useApp } from '../contexts/useApp'

const MAX_TITLE = 200

export function Shopping() {
  const { household, members } = useApp()
  const { pending, doneToday, history, loading, add, addBatch, toggle, remove, restore } =
    useShoppingList()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [snackbar, setSnackbar] = useState<{ id: string; title: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const snackbarTimer = useRef<number | null>(null)

  const handleAdd = useCallback(async () => {
    const value = draft.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await add(value)
      setDraft('')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }, [draft, busy, add])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleAdd()
    }
  }

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData('text')
      if (!text.includes('\n')) return
      e.preventDefault()
      const titles = text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
      if (titles.length === 0) return
      setBusy(true)
      try {
        await addBatch(titles)
        setDraft('')
        inputRef.current?.focus()
      } finally {
        setBusy(false)
      }
    },
    [addBatch],
  )

  const handleRemove = useCallback(
    async (item: ShoppingItem) => {
      await remove(item.id)
      if (snackbarTimer.current) window.clearTimeout(snackbarTimer.current)
      setSnackbar({ id: item.id, title: item.title })
      snackbarTimer.current = window.setTimeout(() => setSnackbar(null), 4000)
    },
    [remove],
  )

  const handleUndoRemove = useCallback(async () => {
    if (!snackbar) return
    await restore(snackbar.id)
    setSnackbar(null)
  }, [restore, snackbar])

  if (!household) return null

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          🛒 Покупки
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Общий список для семьи. Кто-то добавил — у всех обновилось.
        </p>
      </header>

      {/* Поле ввода */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_TITLE))}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Добавить позицию…"
          autoFocus
          enterKeyHint="done"
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={!draft.trim() || busy}
          className="px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-2xl font-medium disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
          aria-label="Добавить"
        >
          +
        </button>
      </div>

      {/* Подсказка для пары из одного человека */}
      {members.length < 2 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Партнёр пока не присоединился — пригласите в Настройках, чтобы видеть список вместе.
        </p>
      )}

      {/* Купить */}
      <section className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Загрузка…</p>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
            <div className="text-4xl mb-2">🛒</div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Список пуст. Добавьте первую позицию ↑
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {pending.map((item) => (
              <ShoppingRow
                key={item.id}
                item={item}
                onToggle={() => void toggle(item.id)}
                onRemove={() => void handleRemove(item)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Куплено сегодня */}
      {doneToday.length > 0 && (
        <section className="space-y-2">
          <button
            onClick={() => setDoneOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>✓ Куплено сегодня · {doneToday.length}</span>
            <span aria-hidden>{doneOpen ? '▾' : '▸'}</span>
          </button>
          {doneOpen && (
            <ul className="space-y-1.5">
              {doneToday.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  done
                  onToggle={() => void toggle(item.id)}
                  onRemove={() => void handleRemove(item)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* История покупок */}
      {history.length > 0 && (
        <section className="space-y-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>🗓 История покупок · {history.length}</span>
            <span aria-hidden>{historyOpen ? '▾' : '▸'}</span>
          </button>
          {historyOpen && (
            <div className="space-y-4">
              {groupHistoryByDay(history).map(({ key, label, items }) => (
                <div key={key} className="space-y-1.5">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
                    {label}
                  </h3>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        done
                        onToggle={() => void toggle(item.id)}
                        onRemove={() => void handleRemove(item)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Snackbar "удалено / отменить" */}
      {snackbar && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-slate-700 text-white rounded-xl px-4 py-3 shadow-lg flex items-center gap-3"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
        >
          <span className="text-sm">Удалено: «{snackbar.title}»</span>
          <button
            onClick={() => void handleUndoRemove()}
            className="text-sm font-medium text-indigo-300 hover:text-indigo-200"
          >
            Отменить
          </button>
        </div>
      )}
    </div>
  )
}

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
})

function dayLabel(date: Date, today: Date): string {
  const diffDays = Math.round(
    (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (diffDays === 1) return 'Вчера'
  if (diffDays === 2) return 'Позавчера'
  return DAY_LABEL_FORMATTER.format(date)
}

function groupHistoryByDay(
  items: ShoppingItem[],
): { key: string; label: string; items: ShoppingItem[] }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const groups = new Map<string, ShoppingItem[]>()
  for (const item of items) {
    const d = new Date(item.checked_at!)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString()
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: dayLabel(new Date(key), today),
      items,
    }))
}

function ShoppingRow({
  item,
  done = false,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem
  done?: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3">
      <button
        onClick={onToggle}
        aria-label={done ? 'Вернуть в список' : 'Отметить купленным'}
        className={`shrink-0 h-7 w-7 rounded-full border-2 flex items-center justify-center transition-colors ${
          done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'
        }`}
      >
        {done && <span className="text-sm leading-none">✓</span>}
      </button>
      <span
        className={`flex-1 text-base break-words ${
          done
            ? 'text-slate-400 dark:text-slate-500 line-through'
            : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {item.title}
      </span>
      <button
        onClick={onRemove}
        aria-label="Удалить"
        className="shrink-0 p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
      >
        <span aria-hidden className="text-lg leading-none">×</span>
      </button>
    </li>
  )
}

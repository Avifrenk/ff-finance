import { useEffect, useRef, useState, type ReactNode } from 'react'

export type RowMenuItem = {
  label: string
  onClick: () => void
  danger?: boolean
}

export function RowMenu({ items, label = 'Действия' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="px-2 py-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-700/60 rounded-md text-base leading-none"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <MenuItem
              key={i}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              danger={item.danger}
            >
              {item.label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
        danger
          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

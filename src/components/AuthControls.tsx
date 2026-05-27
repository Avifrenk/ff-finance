import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white/80 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500 text-white text-xl font-bold flex items-center justify-center">
              ₪
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors ${
        props.className ?? ''
      }`}
    />
  )
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium transition-colors ${
        props.className ?? ''
      }`}
    />
  )
}

export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium transition-colors ${
        props.className ?? ''
      }`}
    />
  )
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium transition-colors flex items-center justify-center gap-2"
    >
      <GoogleIcon className="h-4 w-4" />
      Войти через Google
    </button>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
      {children}
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45c-.28 1.5-1.12 2.77-2.4 3.62v3.01h3.87c2.27-2.09 3.57-5.18 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.79-2.12-6.74-4.96H1.27v3.11C3.26 21.31 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.26 14.27c-.24-.72-.38-1.5-.38-2.27s.14-1.55.38-2.27V6.62H1.27C.46 8.24 0 10.06 0 12c0 1.94.46 3.76 1.27 5.38l3.99-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l3.99 3.11C6.21 6.89 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}

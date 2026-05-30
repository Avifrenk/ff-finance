import { usePush } from '../hooks/usePush'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { ErrorBox } from './AuthControls'

export function NotificationsSection() {
  const { supported, permission, isSubscribed, loading, error, enable, disable } = usePush()
  const { isIOS, isInstalled } = useInstallPrompt()

  if (!supported) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">🔔 Уведомления</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Этот браузер не поддерживает push-уведомления.
          {isIOS && !isInstalled && ' На iPhone — сначала установите приложение на главный экран (нужен iOS 16.4+).'}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">🔔 Уведомления</h2>
        <Toggle
          checked={isSubscribed}
          disabled={loading || permission === 'denied'}
          onChange={(v) => (v ? void enable() : void disable())}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Push о превышении бюджета, достижении цели и settlement'ах от партнёра.
        {isIOS && !isInstalled && ' На iPhone — сначала установите приложение на главный экран (iOS 16.4+).'}
      </p>
      {permission === 'denied' && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Уведомления заблокированы в настройках браузера. Разрешите доступ для этого сайта и
          попробуйте снова.
        </p>
      )}
      {error && (
        <div className="mt-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
    </section>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

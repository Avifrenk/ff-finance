import { useInstallPrompt } from '../hooks/useInstallPrompt'

export function InstallBanner() {
  const { canInstall, isInstalled, isIOS, install, dismissed, dismiss } = useInstallPrompt()

  if (isInstalled || dismissed) return null
  if (!canInstall && !isIOS) return null

  return (
    <section className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 p-4 flex items-start gap-3">
      <div className="text-2xl shrink-0">📱</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 dark:text-slate-100">
          Установите FF Finance на главный экран
        </div>
        {canInstall ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Откроется одним тапом, без браузерной адресной строки.
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            На iPhone: нажмите кнопку «Поделиться» (квадрат со стрелкой вверх) → «На экран „Домой"».
          </div>
        )}
        {canInstall && (
          <button
            onClick={() => void install()}
            className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Установить
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Скрыть"
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none -mt-1 -mr-1 p-1"
      >
        ×
      </button>
    </section>
  )
}

export function InstallSection() {
  const { canInstall, isInstalled, isIOS, install } = useInstallPrompt()

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Установка приложения</h2>
      {isInstalled ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          ✅ Приложение установлено на этом устройстве.
        </p>
      ) : canInstall ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Откроется одним тапом с главного экрана, без браузерной адресной строки.
          </p>
          <button
            onClick={() => void install()}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Установить
          </button>
        </>
      ) : isIOS ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          На iPhone/iPad: откройте этот сайт в Safari → нажмите «Поделиться»
          (квадрат со стрелкой вверх) → «На экран „Домой"».
        </p>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Откройте этот URL в Chrome / Edge / Safari на телефоне или планшете — браузер сам
          предложит установить.
        </p>
      )}
    </section>
  )
}

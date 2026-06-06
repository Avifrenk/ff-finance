import { useEffect, useState, type FormEvent } from 'react'
import { useTelegramLink } from '../hooks/useTelegramLink'
import { AuthInput, ErrorBox, PrimaryButton, SecondaryButton } from './AuthControls'

interface Props {
  open: boolean
  onClose: () => void
  /** Вызывается после успешной привязки (например, чтобы открыть форму маршрута). */
  onLinked?: () => void
}

// Экран «Привязать мой Telegram». Без привязки нельзя создать маршрут — боту
// некуда слать пуш о скидке. Объясняем по-человечески, как узнать свой chat_id.
export function TelegramLinkDialog({ open, onClose, onLinked }: Props) {
  const { chatId, save } = useTelegramLink()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect -- form-reset при открытии. */
  useEffect(() => {
    if (!open) return
    setValue(chatId !== null ? String(chatId) : '')
    setError(null)
  }, [open, chatId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = value.trim()
    // chat_id — целое число (может быть отрицательным у групп, но у нас — личка).
    if (!/^-?\d{4,}$/.test(trimmed)) {
      setError('chat_id — это число (обычно 8–10 цифр). Проверьте, что скопировали целиком.')
      return
    }
    setBusy(true)
    try {
      await save(Number(trimmed))
      onClose()
      onLinked?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Привязать Telegram
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Когда цена на отслеживаемый билет упадёт, бот пришлёт вам сообщение в
          Telegram. Чтобы он знал, кому писать, привяжите свой аккаунт — это нужно
          сделать один раз.
        </p>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 mb-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
          <p className="font-medium text-slate-800 dark:text-slate-200">
            Как узнать свой номер (chat_id):
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Откройте в Telegram бота{' '}
              <a
                href="https://t.me/frenkel_tickets_bot"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 dark:text-indigo-400 underline"
              >
                @frenkel_tickets_bot
              </a>{' '}
              и нажмите «Старт».
            </li>
            <li>
              Или напишите боту{' '}
              <a
                href="https://t.me/userinfobot"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 dark:text-indigo-400 underline"
              >
                @userinfobot
              </a>{' '}
              — он сразу ответит вашим числом (поле <span className="font-mono">Id</span>).
            </li>
            <li>Скопируйте это число и вставьте сюда.</li>
          </ol>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Ваш chat_id
            </label>
            <AuthInput
              type="text"
              inputMode="numeric"
              placeholder="например, 123456789"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required
            />
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex gap-2 pt-2">
            <SecondaryButton type="button" onClick={onClose}>
              Отмена
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Привязать'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  )
}

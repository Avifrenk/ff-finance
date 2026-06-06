import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/useApp'
import { useAccounts } from '../hooks/useAccounts'
import { useCategories } from '../hooks/useCategories'
import { useOperations } from '../hooks/useOperations'
import { supabase } from '../lib/supabase'
import { ErrorBox } from '../components/AuthControls'

// Фаза 6.1: страница распознавания чека.
// Flow: выбрать фото → upload в Storage → INSERT scan (pending)
//       → invoke ai-parse-receipt → форма подтверждения → INSERT operation.

interface ParsedItem {
  name: string
  quantity: number
  price: number
  category_hint: string
}

interface ParsedReceipt {
  vendor: string
  date: string | null
  currency: string
  total: number
  items: ParsedItem[]
}

interface ScanResponse {
  ok: boolean
  scan_id: string
  parsed: ParsedReceipt
  tokens_in: number
  tokens_out: number
  cost_usd: number
}

type Stage = 'idle' | 'uploading' | 'parsing' | 'confirm' | 'saving' | 'error'

export function ScanReceipt() {
  const navigate = useNavigate()
  const { household, profile, viewMode } = useApp()
  const { accounts: allAccounts } = useAccounts()
  const { categories } = useCategories()
  const { create: createOperation } = useOperations()

  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null)
  const [meta, setMeta] = useState<{ costUsd: number; tokensIn: number; tokensOut: number } | null>(null)

  // Поля формы подтверждения
  const [accountId, setAccountId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [occurredAt, setOccurredAt] = useState<string>('')
  const [vendor, setVendor] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Доступные счета в текущем viewMode
  const accounts = useMemo(() => {
    if (viewMode === 'personal') {
      return allAccounts.filter(
        (a) => a.visibility === 'personal' && a.owner_profile_id === profile?.id,
      )
    }
    return allAccounts.filter((a) => a.visibility === 'shared')
  }, [allAccounts, viewMode, profile?.id])

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories],
  )

  async function onFileSelected(file: File) {
    if (!household || !profile) {
      setError('Сначала выбери семью')
      return
    }
    setError(null)
    setStage('uploading')

    // Превью
    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)

    // 1. Генерируем scan_id и загружаем фото в storage
    const newScanId = crypto.randomUUID()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
    const storagePath = `${profile.id}/${newScanId}.${safeExt}`

    const { error: upErr } = await supabase.storage
      .from('receipts')
      .upload(storagePath, file, {
        contentType: file.type || `image/${safeExt}`,
        cacheControl: '3600',
        upsert: false,
      })

    if (upErr) {
      setError(`Загрузка фото: ${upErr.message}`)
      setStage('error')
      return
    }

    // 2. INSERT row scan
    const { error: insErr } = await supabase.from('ai_receipt_scans').insert({
      id: newScanId,
      household_id: household.id,
      author_profile_id: profile.id,
      storage_path: storagePath,
      status: 'pending',
    })

    if (insErr) {
      setError(`Создание записи: ${insErr.message}`)
      setStage('error')
      return
    }

    setScanId(newScanId)
    setStage('parsing')

    // 3. Вызываем Edge Function
    const { data, error: fnErr } = await supabase.functions.invoke<ScanResponse>(
      'ai-parse-receipt',
      { body: { scan_id: newScanId } },
    )

    if (fnErr || !data?.ok) {
      const msg = fnErr?.message ?? 'Не удалось распознать чек'
      setError(msg)
      setStage('error')
      return
    }

    // 4. Заполняем форму
    setParsed(data.parsed)
    setMeta({ costUsd: data.cost_usd, tokensIn: data.tokens_in, tokensOut: data.tokens_out })
    setVendor(data.parsed.vendor || '')
    setAmount(String(data.parsed.total || ''))
    setOccurredAt(data.parsed.date || new Date().toISOString().slice(0, 10))

    // Подбор категории по category_hint первого item
    const hint = data.parsed.items[0]?.category_hint?.toLowerCase() || ''
    const matchedCat =
      expenseCategories.find((c) => c.name.toLowerCase().includes(hint)) ??
      expenseCategories.find((c) => hint.includes(c.name.toLowerCase())) ??
      expenseCategories[0]
    if (matchedCat) setCategoryId(matchedCat.id)

    // Дефолтный счёт — первый из видимых
    if (accounts[0]) setAccountId(accounts[0].id)

    setStage('confirm')
  }

  async function onSave() {
    if (!parsed || !scanId || !accountId || !amount || !occurredAt) {
      setError('Заполни все поля')
      return
    }
    setStage('saving')
    setError(null)

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Сумма должна быть положительным числом')
      setStage('confirm')
      return
    }

    try {
      const op = await createOperation({
        account_id: accountId,
        category_id: categoryId || null,
        kind: 'expense',
        amount: amountNum,
        occurred_at: occurredAt,
        note: vendor || null,
        is_private: false,
      })

      // Привязываем operation к скану
      await supabase
        .from('ai_receipt_scans')
        .update({ status: 'applied', applied_operation_id: op.id })
        .eq('id', scanId)

      navigate('/operations')
    } catch (e) {
      setError((e as Error).message || 'Не удалось сохранить операцию')
      setStage('confirm')
    }
  }

  function reset() {
    setStage('idle')
    setError(null)
    setPreview(null)
    setScanId(null)
    setParsed(null)
    setMeta(null)
    setAccountId('')
    setCategoryId('')
    setAmount('')
    setOccurredAt('')
    setVendor('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          📸 Сканер чека
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Сфотографируй чек — AI распознает магазин, сумму и категорию.
        </p>
      </header>

      {error && <ErrorBox>{error}</ErrorBox>}

      {stage === 'idle' && (
        <div className="space-y-4">
          <label className="block">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onFileSelected(file)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-colors text-indigo-700 dark:text-indigo-300 font-medium text-lg"
            >
              📷 Сфотографировать чек
            </button>
          </label>
          <p className="text-xs text-slate-400 text-center">
            Поддерживаются JPG, PNG, WEBP. Максимум 10 MB.
          </p>
        </div>
      )}

      {(stage === 'uploading' || stage === 'parsing') && (
        <div className="space-y-4">
          {preview && (
            <img
              src={preview}
              alt="Чек"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700"
            />
          )}
          <div className="flex items-center justify-center gap-3 py-4 text-slate-500">
            <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>
              {stage === 'uploading' ? 'Загружаю фото...' : 'Распознаю чек...'}
            </span>
          </div>
        </div>
      )}

      {stage === 'confirm' && parsed && (
        <div className="space-y-4">
          {preview && (
            <details className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">
                Показать фото
              </summary>
              <img src={preview} alt="Чек" className="w-full" />
            </details>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <Field label="Магазин">
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </Field>

            <Field label="Сумма">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </Field>

            <Field label="Дата">
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </Field>

            <Field label="Счёт">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">— выбери счёт —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Категория">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">— без категории —</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ?? '🏷️'} {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {parsed.items.length > 0 && (
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer">
                Позиции на чеке ({parsed.items.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-4">
                {parsed.items.map((item, i) => (
                  <li key={i}>
                    {item.name} × {item.quantity} — {item.price.toFixed(2)}{' '}
                    {parsed.currency}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {meta && (
            <p className="text-xs text-slate-400 text-center">
              Распознано за ${meta.costUsd.toFixed(4)} ({meta.tokensIn}+
              {meta.tokensOut} токенов)
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 py-2.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!accountId || !amount}
              className="flex-1 py-2.5 rounded-md bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              Сохранить операцию
            </button>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <button
          type="button"
          onClick={reset}
          className="w-full py-2.5 rounded-md border border-slate-300 dark:border-slate-700"
        >
          Попробовать снова
        </button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600 dark:text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

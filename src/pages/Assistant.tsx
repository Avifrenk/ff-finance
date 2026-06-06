import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../contexts/useApp'
import { supabase } from '../lib/supabase'
import { ErrorBox } from '../components/AuthControls'

// Фаза 6.3: AI-ассистент «Финик».
// Чат с Claude Sonnet 4.6 через Edge Function ai-chat (SSE-стрим).

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface DraftAssistantMessage {
  role: 'assistant'
  content: string
  streaming: boolean
  toolBeingCalled: string | null
}

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

const SUGGESTIONS = [
  'Сколько мы потратили в этом месяце?',
  'Какой баланс у меня на счетах?',
  'Сравни этот месяц с прошлым',
  'На что больше всего тратим в категории «Продукты»?',
]

export function Assistant() {
  const { profile, household } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<DraftAssistantMessage | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      setError(`История: ${error.message}`)
    } else {
      setMessages((data ?? []) as ChatMessage[])
    }
    setLoading(false)
  }, [profile])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Автоскролл вниз при новых сообщениях / чанках
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, draft])

  // Отмена in-flight стрима при размонтировании
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function sendMessage(text: string) {
    if (!text.trim() || sending || !household) return
    setError(null)
    setSending(true)
    setInput('')

    // Оптимистично добавляем user-сообщение
    const optimisticUser: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUser])
    setDraft({ role: 'assistant', content: '', streaming: true, toolBeingCalled: null })

    const { data: sessionRes } = await supabase.auth.getSession()
    const jwt = sessionRes.session?.access_token
    if (!jwt) {
      setError('Сессия истекла, перезайди.')
      setSending(false)
      setDraft(null)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await fetch(`${FUNCTIONS_BASE}/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ user_message: text }),
        signal: ac.signal,
      })

      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const j = await res.json()
          if (j?.error) msg = j.error
        } catch {
          // ignore
        }
        throw new Error(msg)
      }

      if (!res.body) throw new Error('Нет тела ответа')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let assistantId: string | null = null

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Разбираем SSE-блоки, разделённые \n\n
        let sepIdx: number
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx)
          buffer = buffer.slice(sepIdx + 2)
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            try {
              const ev = JSON.parse(payload)
              if (ev.type === 'chunk') {
                accumulated += ev.delta
                setDraft({
                  role: 'assistant',
                  content: accumulated,
                  streaming: true,
                  toolBeingCalled: null,
                })
              } else if (ev.type === 'tool') {
                setDraft((d) => ({
                  role: 'assistant',
                  content: d?.content ?? '',
                  streaming: true,
                  toolBeingCalled: ev.name as string,
                }))
              } else if (ev.type === 'done') {
                assistantId = ev.message_id ?? null
              } else if (ev.type === 'error') {
                throw new Error(ev.message ?? 'Ошибка ассистента')
              }
            } catch (parseErr) {
              throw new Error(`SSE parse: ${(parseErr as Error).message}`)
            }
          }
        }
      }

      // Финализируем: добавляем assistant-сообщение в историю
      if (accumulated.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId ?? `assistant-${Date.now()}`,
            role: 'assistant',
            content: accumulated,
            created_at: new Date().toISOString(),
          },
        ])
      }
      setDraft(null)
      // Подтянем актуальную историю — там настоящие id и created_at
      loadHistory()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message ?? 'Не удалось получить ответ')
      }
      setDraft(null)
      // Откатим оптимистичное user-сообщение, если оно ещё не сохранено
      // (на сервере оно уже сохранено если ошибка случилась после INSERT;
      //  loadHistory ниже синхронизирует состояние).
      loadHistory()
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  async function clearHistory() {
    if (!profile) return
    if (!confirm('Удалить всю историю переписки с ассистентом?')) return
    setClearing(true)
    const { error } = await supabase
      .from('ai_chat_messages')
      .delete()
      .eq('profile_id', profile.id)
    setClearing(false)
    if (error) {
      setError(`Очистка: ${error.message}`)
      return
    }
    setMessages([])
  }

  const isEmpty = useMemo(
    () => messages.length === 0 && !draft,
    [messages.length, draft],
  )

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 flex flex-col h-[calc(100vh-9rem)]">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
            💬 Финик
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Спроси что угодно про ваши финансы. Лимит 50 сообщений в день.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={clearing}
            className="text-xs px-2.5 py-1.5 rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
          >
            {clearing ? 'Очищаю…' : 'Очистить'}
          </button>
        )}
      </header>

      {error && (
        <div className="mb-2">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 p-3 space-y-3"
      >
        {loading && (
          <div className="text-sm text-slate-400 text-center py-8">Загружаю историю…</div>
        )}

        {!loading && isEmpty && (
          <div className="space-y-4 py-6">
            <p className="text-center text-slate-500 dark:text-slate-400 text-sm">
              Привет! Я Финик, помогу разобраться в ваших финансах. Спроси:
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}

        {draft && (
          <MessageBubble
            role="assistant"
            content={draft.content}
            streaming
            toolBeingCalled={draft.toolBeingCalled}
          />
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage(input)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спроси про траты, баланс, бюджет…"
          disabled={sending || !household}
          className="flex-1 px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !household}
          className="px-4 py-2.5 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50"
        >
          {sending ? '…' : 'Спросить'}
        </button>
      </form>
    </div>
  )
}

function MessageBubble({
  role,
  content,
  streaming,
  toolBeingCalled,
}: {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  toolBeingCalled?: string | null
}) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? 'bg-indigo-500 text-white rounded-br-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm'
        }`}
      >
        {content || (streaming && !toolBeingCalled && <Pulse />)}
        {toolBeingCalled && (
          <div className="mt-1 text-xs opacity-70 italic">
            …считаю ({toolLabel(toolBeingCalled)})
          </div>
        )}
        {streaming && content && <span className="ml-1 animate-pulse">▍</span>}
      </div>
    </div>
  )
}

function Pulse() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" />
    </span>
  )
}

function toolLabel(name: string): string {
  switch (name) {
    case 'sum_by_category':
      return 'смотрю расходы по категориям'
    case 'get_balance':
      return 'считаю балансы'
    case 'compare_months':
      return 'сравниваю месяцы'
    default:
      return name
  }
}

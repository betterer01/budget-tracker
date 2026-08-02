'use client'
import { useState, useRef, useEffect } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Как я трачу деньги в этом месяце?',
  'На чём можно сэкономить?',
  'Спрогнозируй расходы до конца месяца',
  'Как мне быстрее закрыть кредиты?',
  'Какой у меня финансовый прогресс?',
]

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Привет! Я ваш персональный финансист. У меня есть доступ к вашим транзакциям, бюджету и планам. Спросите меня что угодно о ваших финансах — я дам конкретные рекомендации с цифрами.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Ошибка соединения. Попробуйте ещё раз.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>ИИ-финансист</h1>
        <p style={{ color: '#7a8499', fontSize: 14, marginTop: 4 }}>Знает ваши транзакции, бюджет и историю расходов</p>
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{
              background: '#1e2535', border: '1px solid #2d3748', borderRadius: 20,
              padding: '8px 14px', fontSize: 13, color: '#a0aec0', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%',
              padding: '12px 16px',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? '#3b5bdb' : '#161b27',
              border: m.role === 'assistant' ? '1px solid #1e2535' : 'none',
              fontSize: 14,
              color: '#e8eaf0',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.role === 'assistant' && <span style={{ fontSize: 16, marginRight: 8 }}>🤖</span>}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', color: '#7a8499', fontSize: 14 }}>
              🤖 Анализирую данные...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          className="input"
          placeholder="Спросите что угодно о ваших финансах..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button className="btn-primary" onClick={() => send()} disabled={loading || !input.trim()} style={{ whiteSpace: 'nowrap' }}>
          Отправить
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Obligation, Category } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)

export default function Settings() {
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({ name: '', amount: '', due_day: '', category_id: '', end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [oblRes, catRes] = await Promise.all([
      supabase.from('budget_obligations').select('*').order('created_at'),
      supabase.from('budget_categories').select('*').order('sort_order'),
    ])
    setObligations(oblRes.data || [])
    setCategories(catRes.data || [])
  }, [])

  useEffect(() => { load() }, [load])

  const addObligation = async () => {
    if (!form.name || !form.amount) return
    setSaving(true)
    await supabase.from('budget_obligations').insert({
      name: form.name,
      amount: parseFloat(form.amount),
      due_day: form.due_day ? parseInt(form.due_day) : null,
      category_id: form.category_id || null,
      end_date: form.end_date || null,
      notes: form.notes || null,
    })
    setForm({ name: '', amount: '', due_day: '', category_id: '', end_date: '', notes: '' })
    setSaving(false)
    load()
  }

  const toggleObligation = async (id: string, current: boolean) => {
    await supabase.from('budget_obligations').update({ is_active: !current }).eq('id', id)
    load()
  }

  const totalFixed = obligations.filter(o => o.is_active).reduce((a, o) => a + o.amount, 0)

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>Настройки</h1>
        <p style={{ color: '#7a8499', fontSize: 14, marginTop: 4 }}>Обязательства, категории, интеграции</p>
      </div>

      {/* Obligations */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0' }}>📌 Постоянные обязательства</h2>
          <span style={{ fontSize: 13, color: '#ef4444', fontFamily: 'monospace' }}>Итого: {fmt(totalFixed)} ₸/мес</span>
        </div>

        {obligations.map(o => (
          <div key={o.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0', borderBottom: '1px solid #1e2535',
            opacity: o.is_active ? 1 : 0.4,
          }}>
            <div>
              <div style={{ fontSize: 14, color: '#e8eaf0', fontWeight: 500 }}>{o.name}</div>
              <div style={{ fontSize: 12, color: '#7a8499', marginTop: 2 }}>
                {o.due_day ? `${o.due_day}-е число` : 'без срока'}
                {o.end_date ? ` · до ${o.end_date}` : ''}
                {o.notes ? ` · ${o.notes}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{fmt(o.amount)} ₸</span>
              <button
                onClick={() => toggleObligation(o.id, o.is_active)}
                style={{ background: 'none', border: '1px solid #1e2535', borderRadius: 6, padding: '4px 10px', color: '#7a8499', cursor: 'pointer', fontSize: 12 }}
              >
                {o.is_active ? 'Выкл' : 'Вкл'}
              </button>
            </div>
          </div>
        ))}

        {/* Add form */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#7a8499', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Добавить</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input className="input" placeholder="Название (напр. Ипотека)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className="input" type="number" placeholder="Сумма ₸" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            <input className="input" type="number" placeholder="День месяца (1-31)" value={form.due_day} onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} />
            <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">Категория...</option>
              {categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <input className="input" type="date" placeholder="Дата окончания" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            <input className="input" placeholder="Заметка" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <button className="btn-primary" onClick={addObligation} disabled={saving || !form.name || !form.amount}>
            {saving ? 'Сохраняю...' : '+ Добавить обязательство'}
          </button>
        </div>
      </div>

      {/* Telegram setup */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>🤖 Telegram бот</h2>
        <div style={{ fontSize: 13, color: '#a0aec0', lineHeight: 2 }}>
          <p>Для настройки Telegram бота:</p>
          <ol style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Создай бота через <strong>@BotFather</strong> в Telegram</li>
            <li>Добавь токен в Vercel: <code style={{ background: '#1e2535', padding: '2px 6px', borderRadius: 4 }}>TELEGRAM_BOT_TOKEN</code></li>
            <li>Добавь свой Telegram ID: <code style={{ background: '#1e2535', padding: '2px 6px', borderRadius: 4 }}>TELEGRAM_ALLOWED_USERS</code></li>
            <li>Установи вебхук командой в браузере:</li>
          </ol>
          <code style={{ display: 'block', background: '#1e2535', padding: 12, borderRadius: 8, marginTop: 8, fontSize: 12, wordBreak: 'break-all' }}>
            {'https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_VERCEL_URL>/api/telegram'}
          </code>
          <p style={{ marginTop: 12 }}>После настройки боту можно:</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li>Отправлять фото чека → автоматическое распознавание</li>
            <li>Писать текстом: <code style={{ background: '#1e2535', padding: '2px 6px', borderRadius: 4 }}>1500 продукты Магнум</code></li>
            <li>Смотреть баланс: <code style={{ background: '#1e2535', padding: '2px 6px', borderRadius: 4 }}>/balance</code></li>
          </ul>
        </div>
      </div>

      {/* Categories info */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>🏷️ Категории</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <span style={{ fontSize: 14 }}>{c.icon}</span>
              <span style={{ fontSize: 13, color: '#a0aec0' }}>{c.name}</span>
              {c.is_fixed && <span style={{ fontSize: 11, color: '#7a8499', marginLeft: 'auto' }}>фикс.</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

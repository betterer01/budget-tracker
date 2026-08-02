'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, Transaction, Category } from '@/lib/supabase'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [receiptProcessing, setReceiptProcessing] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    type: 'expense' as 'expense' | 'income',
    amount: '',
    category_id: '',
    description: '',
    merchant: '',
    date: new Date().toISOString().split('T')[0],
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [txRes, catRes] = await Promise.all([
      supabase.from('budget_transactions').select('*, budget_categories(*)').order('date', { ascending: false }).limit(100),
      supabase.from('budget_categories').select('*').order('sort_order'),
    ])
    setTransactions(txRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.amount || !form.category_id) return
    await supabase.from('budget_transactions').insert({
      ...form,
      amount: parseFloat(form.amount),
      source: 'manual',
    })
    setForm({ type: 'expense', amount: '', category_id: '', description: '', merchant: '', date: new Date().toISOString().split('T')[0] })
    setShowForm(false)
    load()
  }

  const deleteTransaction = async (id: string) => {
    if (!confirm('Удалить транзакцию?')) return
    setDeleting(id)
    await supabase.from('budget_transactions').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  const handleReceipt = async (file: File) => {
    setReceiptProcessing(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/receipt', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.amount) {
        setForm(f => ({
          ...f,
          amount: String(data.amount),
          merchant: data.merchant || '',
          description: data.description || '',
          category_id: data.category_id || '',
        }))
        setShowForm(true)
      }
    } catch {
      alert('Не удалось распознать чек. Введите вручную.')
    }
    setReceiptProcessing(false)
  }

  const filteredCats = categories.filter(c => c.type === form.type)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>Транзакции</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-primary"
            style={{ background: '#1e2535', border: '1px solid #2d3748' }}
            onClick={() => fileRef.current?.click()}
            disabled={receiptProcessing}
          >
            {receiptProcessing ? '⏳ Распознаю...' : '📷 Загрузить чек'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleReceipt(e.target.files[0])} />
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            + Добавить
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>Новая транзакция</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Тип</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'expense' | 'income', category_id: '' }))}>
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Сумма (₸)</label>
              <input className="input" type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Категория</label>
              <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">Выберите...</option>
                {filteredCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Дата</label>
              <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Описание</label>
              <input className="input" placeholder="Необязательно" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Магазин / Получатель</label>
              <input className="input" placeholder="Необязательно" value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={save}>Сохранить</button>
            <button className="btn-primary" style={{ background: 'transparent', border: '1px solid #1e2535' }} onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#7a8499' }}>Загрузка...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#7a8499' }}>Нет транзакций</div>
        ) : (
          transactions.map((tx, i) => (
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < transactions.length - 1 ? '1px solid #1e2535' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: '#1e2535',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {tx.budget_categories?.icon || '📦'}
                </div>
                <div>
                  <div style={{ fontSize: 14, color: '#e8eaf0', fontWeight: 500 }}>
                    {tx.description || tx.budget_categories?.name || '—'}
                  </div>
                  <div style={{ fontSize: 12, color: '#7a8499', marginTop: 2 }}>
                    {format(new Date(tx.date), 'd MMM', { locale: ru })}
                    {tx.merchant ? ` · ${tx.merchant}` : ''}
                    {tx.source !== 'manual' ? ` · ${tx.source}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: tx.type === 'income' ? '#22c55e' : '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
                    {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)} ₸
                  </div>
                  <div style={{ fontSize: 11, color: '#7a8499' }}>{tx.budget_categories?.name}</div>
                </div>
                <button
                  onClick={() => deleteTransaction(tx.id)}
                  disabled={deleting === tx.id}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: deleting === tx.id ? '#4a5568' : '#4a5568',
                    fontSize: 18, padding: '4px', lineHeight: 1,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#4a5568')}
                >
                  {deleting === tx.id ? '...' : '×'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

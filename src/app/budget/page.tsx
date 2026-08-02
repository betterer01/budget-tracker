
Budget page · TXT
'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, Category, Obligation } from '@/lib/supabase'
 
const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)
 
type PlanItem = {
  id: string
  year: number
  month: number
  category_id: string | null
  name: string
  planned_amount: number
  recurrence: 'monthly' | 'onetime'
  comment: string | null
  attachment_url: string | null
  attachment_name: string | null
  type: 'expense' | 'income'
  budget_categories?: Category
}
 
const EMPTY_FORM = {
  type: 'expense' as 'expense' | 'income',
  category_id: '',
  name: '',
  amount: '',
  recurrence: 'monthly' as 'monthly' | 'onetime',
  comment: '',
}
 
export default function Budget() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<PlanItem | null>(null)
  const [detailItem, setDetailItem] = useState<PlanItem | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
 
  const load = useCallback(async () => {
    const [catRes, itemsRes, oblRes] = await Promise.all([
      supabase.from('budget_categories').select('*').order('sort_order'),
      supabase.from('budget_plan_items').select('*, budget_categories(*)').eq('year', year).eq('month', month).order('created_at'),
      supabase.from('budget_obligations').select('*').eq('is_active', true),
    ])
    setCategories(catRes.data || [])
    setItems(itemsRes.data || [])
    setObligations(oblRes.data || [])
  }, [year, month])
 
  useEffect(() => { load() }, [load])
 
  const openAdd = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }
 
  const openEdit = (item: PlanItem) => {
    setEditItem(item)
    setForm({
      type: item.type,
      category_id: item.category_id || '',
      name: item.name,
      amount: String(item.planned_amount),
      recurrence: item.recurrence,
      comment: item.comment || '',
    })
    setShowModal(true)
    setDetailItem(null)
  }
 
  const save = async () => {
    if (!form.name || !form.amount) return
    setSaving(true)
    const payload = {
      year, month,
      type: form.type,
      category_id: form.category_id || null,
      name: form.name,
      planned_amount: parseFloat(form.amount),
      recurrence: form.recurrence,
      comment: form.comment || null,
    }
    if (editItem) {
      await supabase.from('budget_plan_items').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('budget_plan_items').insert(payload)
    }
    setForm(EMPTY_FORM)
    setShowModal(false)
    setEditItem(null)
    setSaving(false)
    load()
  }
 
  const deleteItem = async (id: string) => {
    setDeleting(id)
    await supabase.from('budget_plan_items').delete().eq('id', id)
    setDeleting(null)
    setDetailItem(null)
    load()
  }
 
  const handleAttachment = async (file: File, item: PlanItem) => {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `budget/${item.id}/${Date.now()}.${ext}`
    const { data } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
    if (data) {
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path)
      await supabase.from('budget_plan_items').update({
        attachment_url: urlData.publicUrl,
        attachment_name: file.name,
      }).eq('id', item.id)
      load()
      // refresh detail
      const updated = { ...item, attachment_url: urlData.publicUrl, attachment_name: file.name }
      setDetailItem(updated)
    }
    setUploading(false)
  }
 
  const incomePlan = items.filter(i => i.type === 'income')
  const fixedPlan = items.filter(i => i.type === 'expense' && i.budget_categories?.is_fixed)
  const varPlan = items.filter(i => i.type === 'expense' && !i.budget_categories?.is_fixed)
  const totalIncome = incomePlan.reduce((a, i) => a + i.planned_amount, 0)
  const totalExpense = items.filter(i => i.type === 'expense').reduce((a, i) => a + i.planned_amount, 0)
  const surplus = totalIncome - totalExpense
  const filteredCats = categories.filter(c => c.type === form.type)
 
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>Бюджет</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="input" style={{ width: 'auto' }} value={month} onChange={e => setMonth(+e.target.value)}>
            {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn-primary" onClick={openAdd}>+ Добавить</button>
        </div>
      </div>
 
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', marginBottom: 8 }}>Доход (план)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>{fmt(totalIncome)} ₸</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', marginBottom: 8 }}>Расходы (план)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{fmt(totalExpense)} ₸</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', marginBottom: 8 }}>Свободный остаток</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: surplus >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{fmt(surplus)} ₸</div>
        </div>
      </div>
 
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="💼 Доходы" items={incomePlan} onEdit={openEdit} onDelete={deleteItem} onDetail={setDetailItem} deleting={deleting} />
          {obligations.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 14 }}>📌 Обязательства</h3>
              {obligations.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e2535' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#e8eaf0' }}>{o.name}</div>
                    {o.due_day && <div style={{ fontSize: 11, color: '#7a8499' }}>{o.due_day}-е число</div>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>{fmt(o.amount)} ₸</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="🔒 Фиксированные" items={fixedPlan} onEdit={openEdit} onDelete={deleteItem} onDetail={setDetailItem} deleting={deleting} />
          <Section title="📦 Переменные" items={varPlan} onEdit={openEdit} onDelete={deleteItem} onDetail={setDetailItem} deleting={deleting} />
        </div>
      </div>
 
      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="card" style={{ padding: 28, width: 440 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0', marginBottom: 20 }}>
              {editItem ? 'Редактировать' : 'Добавить в бюджет'}
            </h3>
 
            {/* Income / Expense toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['expense', 'income'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t, category_id: '' }))} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: form.type === t ? (t === 'income' ? '#22c55e' : '#ef4444') : '#1e2535',
                  color: form.type === t ? 'white' : '#7a8499',
                }}>
                  {t === 'income' ? '📈 Доход' : '📉 Расход'}
                </button>
              ))}
            </div>
 
            {/* Monthly / Onetime */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Тип</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([['monthly', '🔄 Ежемесячная'], ['onetime', '1️⃣ Одноразовая']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setForm(f => ({ ...f, recurrence: val }))} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 13,
                    borderColor: form.recurrence === val ? '#3b5bdb' : '#1e2535',
                    background: form.recurrence === val ? '#1e2d5e' : '#1e2535',
                    color: form.recurrence === val ? '#e8eaf0' : '#7a8499',
                  }}>{label}</button>
                ))}
              </div>
            </div>
 
            {/* Name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Название статьи *</label>
              <input className="input" placeholder="Напр. Ипотека, Продукты..." value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
 
            {/* Category */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Категория</label>
              <select className="input" value={form.category_id} onChange={e => {
                const cat = categories.find(c => c.id === e.target.value)
                setForm(f => ({ ...f, category_id: e.target.value, name: f.name || cat?.name || '' }))
              }}>
                <option value="">— без категории —</option>
                {filteredCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
 
            {/* Amount */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Сумма (₸) *</label>
              <input className="input" type="number" placeholder="0" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
 
            {/* Comment */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>Комментарий</label>
              <textarea className="input" placeholder="Заметки..." value={form.comment} rows={2}
                onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                style={{ resize: 'none', fontFamily: 'inherit' }} />
            </div>
 
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={save} disabled={saving || !form.name || !form.amount} style={{ flex: 1 }}>
                {saving ? 'Сохраняю...' : editItem ? 'Сохранить' : 'Добавить'}
              </button>
              <button onClick={() => setShowModal(false)} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid #1e2535',
                background: 'transparent', color: '#7a8499', cursor: 'pointer', fontSize: 14,
              }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
 
      {/* Detail drawer */}
      {detailItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setDetailItem(null)}>
          <div className="card" style={{ padding: 28, width: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>{detailItem.name}</div>
                <div style={{ fontSize: 12, color: '#7a8499', marginTop: 4 }}>
                  {detailItem.budget_categories?.icon} {detailItem.budget_categories?.name || '—'}
                  {' · '}{detailItem.recurrence === 'monthly' ? '🔄 ежемесячно' : '1️⃣ одноразово'}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: detailItem.type === 'income' ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>
                {detailItem.type === 'income' ? '+' : '-'}{fmt(detailItem.planned_amount)} ₸
              </div>
            </div>
 
            {detailItem.comment && (
              <div style={{ background: '#1e2535', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#a0aec0', lineHeight: 1.6 }}>
                💬 {detailItem.comment}
              </div>
            )}
 
            {/* Attachment */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#7a8499', marginBottom: 8 }}>Вложение</div>
              {detailItem.attachment_url ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <a href={detailItem.attachment_url} target="_blank" rel="noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: '#1e2535', borderRadius: 8, textDecoration: 'none', color: '#a0aec0', fontSize: 13, flex: 1,
                  }}>
                    📎 {detailItem.attachment_name || 'Открыть файл'}
                  </a>
                  <button onClick={() => fileRef.current?.click()} style={{
                    background: '#1e2535', border: '1px solid #2d3748', borderRadius: 8,
                    padding: '8px 12px', color: '#7a8499', cursor: 'pointer', fontSize: 12,
                  }}>Заменить</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{
                  width: '100%', padding: '12px', background: '#1e2535', border: '1px dashed #2d3748',
                  borderRadius: 8, color: '#7a8499', cursor: 'pointer', fontSize: 13,
                }}>
                  {uploading ? '⏳ Загружаю...' : '📎 Прикрепить фото или PDF'}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleAttachment(e.target.files[0], detailItem)} />
            </div>
 
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={() => openEdit(detailItem)} style={{ flex: 1, background: '#1e2535', border: '1px solid #2d3748' }}>
                ✏️ Редактировать
              </button>
              <button onClick={() => deleteItem(detailItem.id)} disabled={deleting === detailItem.id} style={{
                padding: '10px 16px', borderRadius: 8, border: '1px solid #7f1d1d',
                background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 14,
              }}>
                {deleting === detailItem.id ? '...' : '🗑'}
              </button>
              <button onClick={() => setDetailItem(null)} style={{
                padding: '10px 16px', borderRadius: 8, border: '1px solid #1e2535',
                background: 'transparent', color: '#7a8499', cursor: 'pointer', fontSize: 14,
              }}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
 
function Section({ title, items, onEdit, onDelete, onDetail, deleting }: {
  title: string
  items: PlanItem[]
  onEdit: (item: PlanItem) => void
  onDelete: (id: string) => void
  onDetail: (item: PlanItem) => void
  deleting: string | null
}) {
  const total = items.reduce((a, i) => a + i.planned_amount, 0)
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0' }}>{title}</h3>
        {items.length > 0 && <span style={{ fontSize: 13, color: '#7a8499', fontFamily: 'monospace' }}>{new Intl.NumberFormat('ru-KZ',{maximumFractionDigits:0}).format(total)} ₸</span>}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#4a5568', textAlign: 'center', padding: '16px 0' }}>
          Нажмите &quot;+ Добавить&quot;
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(item => (
            <div key={item.id} onClick={() => onDetail(item)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
              borderBottom: '1px solid #1e2535',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1e2535')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.budget_categories?.icon || '📋'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#7a8499', display: 'flex', gap: 6, marginTop: 2 }}>
                    {item.recurrence === 'monthly' ? '🔄' : '1️⃣'}
                    {item.comment && <span>💬</span>}
                    {item.attachment_url && <span>📎</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', fontFamily: 'monospace' }}>
                  {new Intl.NumberFormat('ru-KZ',{maximumFractionDigits:0}).format(item.planned_amount)} ₸
                </span>
                <button onClick={e => { e.stopPropagation(); onDelete(item.id) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: deleting === item.id ? '#4a5568' : '#ef4444',
                  fontSize: 15, padding: '2px 4px', lineHeight: 1,
                }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
 

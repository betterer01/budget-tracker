'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Category, BudgetPlan, Obligation } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)

export default function Budget() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [categories, setCategories] = useState<Category[]>([])
  const [plans, setPlans] = useState<Record<string, number>>({})
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [totalIncome, setTotalIncome] = useState(0)

  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

  const load = useCallback(async () => {
    const [catRes, planRes, oblRes] = await Promise.all([
      supabase.from('budget_categories').select('*').order('sort_order'),
      supabase.from('budget_plans').select('*').eq('year', year).eq('month', month),
      supabase.from('budget_obligations').select('*').eq('is_active', true),
    ])
    setCategories(catRes.data || [])
    setObligations(oblRes.data || [])
    const planMap: Record<string, number> = {}
    let income = 0
    for (const p of (planRes.data || [])) {
      planMap[p.category_id] = p.planned_amount
      const cat = (catRes.data || []).find(c => c.id === p.category_id)
      if (cat?.type === 'income') income += p.planned_amount
    }
    setPlans(planMap)
    setTotalIncome(income)
  }, [year, month])

  useEffect(() => { load() }, [load])

  const updatePlan = async (categoryId: string, amount: number) => {
    setSaving(categoryId)
    await supabase.from('budget_plans').upsert({
      year, month, category_id: categoryId, planned_amount: amount,
    }, { onConflict: 'year,month,category_id' })
    setPlans(p => ({ ...p, [categoryId]: amount }))
    setSaving(null)
  }

  const totalExpensePlanned = categories.filter(c => c.type === 'expense').reduce((a, c) => a + (plans[c.id] || 0), 0)
  const surplus = totalIncome - totalExpensePlanned

  const incomeCategories = categories.filter(c => c.type === 'income')
  const fixedCategories = categories.filter(c => c.type === 'expense' && c.is_fixed)
  const varCategories = categories.filter(c => c.type === 'expense' && !c.is_fixed)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>Бюджет</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="input" style={{ width: 'auto' }} value={month} onChange={e => setMonth(+e.target.value)}>
            {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
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
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', fontFamily: 'monospace' }}>{fmt(totalExpensePlanned)} ₸</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', marginBottom: 8 }}>Свободный остаток</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: surplus >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace' }}>{fmt(surplus)} ₸</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Income */}
        <div>
          <Section title="💼 Доходы" categories={incomeCategories} plans={plans} saving={saving} onUpdate={updatePlan} />
          {/* Obligations */}
          {obligations.length > 0 && (
            <div className="card" style={{ padding: 20, marginTop: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 14 }}>📌 Обязательства</h3>
              {obligations.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e2535' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#e8eaf0' }}>{o.name}</div>
                    {o.due_day && <div style={{ fontSize: 11, color: '#7a8499' }}>каждое {o.due_day}-е число</div>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>{fmt(o.amount)} ₸</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expenses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Section title="🔒 Фиксированные расходы" categories={fixedCategories} plans={plans} saving={saving} onUpdate={updatePlan} />
          <Section title="📦 Переменные расходы" categories={varCategories} plans={plans} saving={saving} onUpdate={updatePlan} />
        </div>
      </div>
    </div>
  )
}

function Section({ title, categories, plans, saving, onUpdate }: {
  title: string
  categories: Category[]
  plans: Record<string, number>
  saving: string | null
  onUpdate: (id: string, amount: number) => void
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 14 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {categories.map(cat => (
          <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, width: 24 }}>{cat.icon}</span>
            <span style={{ fontSize: 13, color: '#a0aec0', flex: 1 }}>{cat.name}</span>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                className="input"
                style={{ width: 140, textAlign: 'right', paddingRight: 28 }}
                value={plans[cat.id] || ''}
                placeholder="0"
                onChange={e => onUpdate(cat.id, parseFloat(e.target.value) || 0)}
              />
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#7a8499' }}>₸</span>
            </div>
            {saving === cat.id && <span style={{ fontSize: 11, color: '#7a8499' }}>💾</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

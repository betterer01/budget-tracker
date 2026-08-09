'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Transaction, Category } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'

const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)

type Position = { cash_amount: number; debt_amount: number }

export default function Dashboard() {
  const now = new Date()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [monthlyHistory, setMonthlyHistory] = useState<{ month: string; income: number; expense: number }[]>([])
  const [plannedIncome, setPlannedIncome] = useState(0)
  const [plannedExpense, setPlannedExpense] = useState(0)
  const [planItems, setPlanItems] = useState<{ category_id: string | null; planned_amount: number; name: string; budget_categories?: Category }[]>([])
  const [position, setPosition] = useState<Position>({ cash_amount: 0, debt_amount: 0 })
  const [totalSavings, setTotalSavings] = useState(0)
  const [editPosition, setEditPosition] = useState(false)
  const [posForm, setPosForm] = useState({ cash: '', debt: '' })

  const loadData = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(now).toISOString().split('T')[0]
    const end = endOfMonth(now).toISOString().split('T')[0]
    const yr = now.getFullYear()
    const mo = now.getMonth() + 1

    const [txRes, catRes, planRes, planItemsRes, posRes, savingsRes] = await Promise.all([
      supabase.from('budget_transactions').select('*, budget_categories(*)').gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('budget_categories').select('*').order('sort_order'),
      supabase.from('budget_plan_items').select('*').eq('year', yr).eq('month', mo),
      supabase.from('budget_plan_items').select('*, budget_categories(*)').eq('year', yr).eq('month', mo).eq('type', 'expense'),
      supabase.from('financial_position').select('*').eq('year', yr).eq('month', mo).single(),
      supabase.from('savings_goals').select('current_amount').eq('is_active', true),
    ])

    setTransactions(txRes.data || [])
    setCategories(catRes.data || [])
    setPlanItems(planItemsRes.data || [])

    const plans = planRes.data || []
    setPlannedIncome(plans.filter(p => p.type === 'income').reduce((a: number, p: { planned_amount: number }) => a + p.planned_amount, 0))
    setPlannedExpense(plans.filter(p => p.type === 'expense').reduce((a: number, p: { planned_amount: number }) => a + p.planned_amount, 0))

    if (posRes.data) {
      setPosition({ cash_amount: posRes.data.cash_amount, debt_amount: posRes.data.debt_amount })
      setPosForm({ cash: String(posRes.data.cash_amount), debt: String(posRes.data.debt_amount) })
    }

    setTotalSavings((savingsRes.data || []).reduce((a, g) => a + g.current_amount, 0))

    // History: 2 queries instead of 12
    const sixMonthsAgo = startOfMonth(subMonths(now, 5)).toISOString().split('T')[0]
    const [allTxData, allPlanData] = await Promise.all([
      supabase.from('budget_transactions').select('amount,type,date').gte('date', sixMonthsAgo).lte('date', end),
      supabase.from('budget_plan_items').select('planned_amount,type,year,month'),
    ])

    const history = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i)
      const s = startOfMonth(d).toISOString().split('T')[0]
      const e = endOfMonth(d).toISOString().split('T')[0]
      const income = (allPlanData.data || []).filter(p => p.type === 'income' && p.year === d.getFullYear() && p.month === d.getMonth() + 1).reduce((a, p) => a + p.planned_amount, 0)
      const expense = (allTxData.data || []).filter(t => t.type === 'expense' && t.date >= s && t.date <= e).reduce((a, t) => a + t.amount, 0)
      if (income > 0 || expense > 0) {
        history.push({ month: format(d, 'MMM', { locale: ru }), income, expense })
      }
    }
    setMonthlyHistory(history)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const savePosition = async () => {
    const yr = now.getFullYear()
    const mo = now.getMonth() + 1
    await supabase.from('financial_position').upsert({
      year: yr, month: mo,
      cash_amount: parseFloat(posForm.cash) || 0,
      debt_amount: parseFloat(posForm.debt) || 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'year,month' })
    setPosition({ cash_amount: parseFloat(posForm.cash) || 0, debt_amount: parseFloat(posForm.debt) || 0 })
    setEditPosition(false)
  }

  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const balance = plannedIncome - totalExpense
  const budgetUsed = plannedExpense > 0 ? (totalExpense / plannedExpense) * 100 : 0
  const netWorth = position.cash_amount + totalSavings - position.debt_amount
  const projectedCash = position.cash_amount + plannedIncome - plannedExpense

  const expenseByCategory = categories
    .filter(c => c.type === 'expense')
    .map(cat => ({
      name: cat.name, icon: cat.icon, color: cat.color,
      value: transactions.filter(t => t.category_id === cat.id && t.type === 'expense').reduce((a, t) => a + t.amount, 0),
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)

  const dayOfMonth = now.getDate()
  const daysInMonth = endOfMonth(now).getDate()
  const daysLeft = daysInMonth - dayOfMonth
  const dailyRate = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0
  const predictedTotal = dailyRate * daysInMonth

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#7a8499' }}>
      Загрузка...
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>
          {format(now, 'LLLL yyyy', { locale: ru })}
        </h1>
        <p style={{ color: '#7a8499', fontSize: 14, marginTop: 4 }}>
          День {dayOfMonth} из {daysInMonth} · осталось {daysLeft} дней
        </p>
      </div>

      {/* KPI Row 1 — Cash Flow */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Доход (план)" value={`${fmt(plannedIncome)} ₸`} color="#22c55e" icon="📈" />
        <KpiCard label="Расходы (факт)" value={`${fmt(totalExpense)} ₸`} color="#ef4444" icon="📉" />
        <KpiCard label="Остаток месяца" value={`${fmt(balance)} ₸`} color={balance >= 0 ? '#22c55e' : '#ef4444'} icon="💰" />
        <KpiCard label="Бюджет использован" value={`${budgetUsed.toFixed(0)}%`} color={budgetUsed > 90 ? '#ef4444' : budgetUsed > 70 ? '#eab308' : '#22c55e'} icon="📊" />
      </div>

      {/* KPI Row 2 — Financial Position */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 20, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#7a8499', fontWeight: 500 }}>💵 Кэш сейчас</span>
            <button onClick={() => setEditPosition(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#7a8499', padding: 0 }}>✏️</button>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8eaf0', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(position.cash_amount)} ₸</div>
          <div style={{ fontSize: 11, color: '#7a8499', marginTop: 4 }}>→ {fmt(projectedCash)} ₸ к концу мес.</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', fontWeight: 500, marginBottom: 12 }}>📉 Долги</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(position.debt_amount)} ₸</div>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#7a8499', fontWeight: 500, marginBottom: 12 }}>🏦 Сбережения</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(totalSavings)} ₸</div>
        </div>
        <div className="card" style={{ padding: 20, background: netWorth >= 0 ? '#0f2d1f' : '#3d1515', borderColor: netWorth >= 0 ? '#14532d' : '#7f1d1d' }}>
          <div style={{ fontSize: 12, color: '#7a8499', fontWeight: 500, marginBottom: 12 }}>📊 Чистый капитал</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: netWorth >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(netWorth)} ₸</div>
          <div style={{ fontSize: 11, color: '#7a8499', marginTop: 4 }}>Кэш + Сбер - Долги</div>
        </div>
      </div>

      {/* Prediction Banner */}
      {predictedTotal > 0 && plannedExpense > 0 && (
        <div style={{
          background: predictedTotal > plannedExpense ? '#3d1515' : '#0f2d1f',
          border: `1px solid ${predictedTotal > plannedExpense ? '#7f1d1d' : '#14532d'}`,
          borderRadius: 10, padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>{predictedTotal > plannedExpense ? '⚠️' : '✅'}</span>
          <span style={{ fontSize: 14, color: '#e8eaf0' }}>
            <strong>Прогноз:</strong> к концу месяца расходы составят <strong>{fmt(predictedTotal)} ₸</strong>.{' '}
            {predictedTotal > plannedExpense
              ? `Превышение бюджета на ${fmt(predictedTotal - plannedExpense)} ₸`
              : `Укладываетесь в бюджет (план: ${fmt(plannedExpense)} ₸)`}
          </span>
        </div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>История за 6 месяцев</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyHistory} barGap={4}>
              <XAxis dataKey="month" tick={{ fill: '#7a8499', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7a8499', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${fmt(v)} ₸`]} />
              <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Доход (план)" />
              <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="Расходы (факт)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>Расходы по категориям</h3>
          {expenseByCategory.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: '#7a8499', fontSize: 13 }}>
              Нет расходов в этом месяце
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <PieChart width={140} height={140}>
                <Pie data={expenseByCategory} cx={65} cy={65} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                  {expenseByCategory.map((_, i) => <Cell key={i} fill={expenseByCategory[i].color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {expenseByCategory.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#a0aec0' }}>{c.icon} {c.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#e8eaf0' }}>{fmt(c.value)} ₸</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan vs Fact */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>План vs Факт (расходы)</h3>
        {planItems.filter(p => p.planned_amount > 0).length === 0 ? (
          <div style={{ color: '#7a8499', fontSize: 13 }}>Бюджет не заполнен. Перейдите в раздел &quot;Бюджет&quot;</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {planItems.filter(p => p.planned_amount > 0).map((plan, i) => {
              const spent = transactions.filter(t => t.category_id === plan.category_id && t.type === 'expense').reduce((a, t) => a + t.amount, 0)
              const pct = Math.min((spent / plan.planned_amount) * 100, 100)
              const over = spent > plan.planned_amount
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#a0aec0' }}>{plan.budget_categories?.icon} {plan.name}</span>
                    <span style={{ fontSize: 13, color: over ? '#ef4444' : '#e8eaf0' }}>{fmt(spent)} / {fmt(plan.planned_amount)} ₸</span>
                  </div>
                  <div style={{ background: '#1e2535', borderRadius: 4, height: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: over ? '#ef4444' : pct > 80 ? '#eab308' : '#22c55e', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>Последние транзакции</h3>
        {transactions.slice(0, 8).map(tx => (
          <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e2535' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{tx.budget_categories?.icon || '📦'}</span>
              <div>
                <div style={{ fontSize: 13, color: '#e8eaf0' }}>{tx.description || tx.budget_categories?.name || '—'}</div>
                <div style={{ fontSize: 11, color: '#7a8499' }}>{tx.date}{tx.merchant ? ` · ${tx.merchant}` : ''}</div>
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444', fontFamily: 'monospace' }}>-{fmt(tx.amount)} ₸</span>
          </div>
        ))}
        {transactions.length === 0 && (
          <div style={{ color: '#7a8499', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Нет транзакций</div>
        )}
      </div>

      {/* Edit Position Modal */}
      {editPosition && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setEditPosition(false)}>
          <div className="card" style={{ padding: 28, width: 380 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0', marginBottom: 20 }}>
              Финансовая позиция · {format(now, 'MMMM yyyy', { locale: ru })}
            </h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>💵 Кэш на руках (карты + наличные) ₸</label>
              <input className="input" type="number" placeholder="0" value={posForm.cash} onChange={e => setPosForm(f => ({ ...f, cash: e.target.value }))} autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#7a8499', display: 'block', marginBottom: 6 }}>📉 Общая сумма долгов ₸</label>
              <input className="input" type="number" placeholder="0" value={posForm.debt} onChange={e => setPosForm(f => ({ ...f, debt: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={savePosition} style={{ flex: 1 }}>Сохранить</button>
              <button onClick={() => setEditPosition(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #1e2535', background: 'transparent', color: '#7a8499', cursor: 'pointer', fontSize: 14 }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#7a8499', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  )
}

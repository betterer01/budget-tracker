'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Transaction, BudgetPlan, Category } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ru } from 'date-fns/locale'

const fmt = (n: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(n)

export default function Dashboard() {
  const now = new Date()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [plans, setPlans] = useState<BudgetPlan[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [monthlyHistory, setMonthlyHistory] = useState<{ month: string; income: number; expense: number }[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    const start = startOfMonth(now).toISOString().split('T')[0]
    const end = endOfMonth(now).toISOString().split('T')[0]

    const [txRes, planRes, catRes] = await Promise.all([
      supabase.from('budget_transactions').select('*, budget_categories(*)').gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('budget_plans').select('*, budget_categories(*)').eq('year', now.getFullYear()).eq('month', now.getMonth() + 1),
      supabase.from('budget_categories').select('*').order('sort_order'),
    ])

    setTransactions(txRes.data || [])
    setPlans(planRes.data || [])
    setCategories(catRes.data || [])

    // Last 6 months history
    const history = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i)
      const s = startOfMonth(d).toISOString().split('T')[0]
      const e = endOfMonth(d).toISOString().split('T')[0]
      const { data } = await supabase.from('budget_transactions').select('amount,type').gte('date', s).lte('date', e)
      const income = (data || []).filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
      const expense = (data || []).filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
      history.push({ month: format(d, 'MMM', { locale: ru }), income, expense })
    }
    setMonthlyHistory(history)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const balance = totalIncome - totalExpense
  const totalPlanned = plans.filter(p => p.budget_categories?.type === 'expense').reduce((a, p) => a + p.planned_amount, 0)
  const budgetUsed = totalPlanned > 0 ? (totalExpense / totalPlanned) * 100 : 0

  // Spending by category for pie
  const expenseByCategory = categories
    .filter(c => c.type === 'expense')
    .map(cat => ({
      name: cat.name,
      value: transactions.filter(t => t.category_id === cat.id && t.type === 'expense').reduce((a, t) => a + t.amount, 0),
      color: cat.color,
      icon: cat.icon,
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)

  // Days remaining prediction
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
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>
          {format(now, 'LLLL yyyy', { locale: ru })}
        </h1>
        <p style={{ color: '#7a8499', fontSize: 14, marginTop: 4 }}>
          День {dayOfMonth} из {daysInMonth} · осталось {daysLeft} дней
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Доходы" value={`${fmt(totalIncome)} ₸`} color="#22c55e" icon="📈" />
        <KpiCard label="Расходы" value={`${fmt(totalExpense)} ₸`} color="#ef4444" icon="📉" />
        <KpiCard label="Остаток" value={`${fmt(balance)} ₸`} color={balance >= 0 ? '#22c55e' : '#ef4444'} icon="💰" />
        <KpiCard label="Бюджет использован" value={`${budgetUsed.toFixed(0)}%`} color={budgetUsed > 90 ? '#ef4444' : budgetUsed > 70 ? '#eab308' : '#22c55e'} icon="📊" />
      </div>

      {/* Prediction Banner */}
      {predictedTotal > 0 && totalPlanned > 0 && (
        <div style={{
          background: predictedTotal > totalPlanned ? '#3d1515' : '#0f2d1f',
          border: `1px solid ${predictedTotal > totalPlanned ? '#7f1d1d' : '#14532d'}`,
          borderRadius: 10,
          padding: '14px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>{predictedTotal > totalPlanned ? '⚠️' : '✅'}</span>
          <span style={{ fontSize: 14, color: '#e8eaf0' }}>
            <strong>Прогноз:</strong> при текущем темпе к концу месяца расходы составят{' '}
            <strong>{fmt(predictedTotal)} ₸</strong>.{' '}
            {predictedTotal > totalPlanned
              ? `Превышение бюджета на ${fmt(predictedTotal - totalPlanned)} ₸`
              : `Укладываетесь в бюджет (план: ${fmt(totalPlanned)} ₸)`}
          </span>
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Monthly history bar chart */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>
            История за 6 месяцев
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyHistory} barGap={4}>
              <XAxis dataKey="month" tick={{ fill: '#7a8499', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#7a8499', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${fmt(v)} ₸`]}
              />
              <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Доходы" />
              <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name="Расходы" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Spending by category pie */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>
            Расходы по категориям
          </h3>
          {expenseByCategory.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#7a8499', fontSize: 13 }}>
              Нет расходов в этом месяце
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <PieChart width={140} height={140}>
                <Pie data={expenseByCategory} cx={65} cy={65} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                  {expenseByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {expenseByCategory.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                      <span style={{ fontSize: 12, color: '#a0aec0' }}>{c.icon} {c.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#e8eaf0' }}>{fmt(c.value)} ₸</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Budget progress bars */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>
          План vs Факт
        </h3>
        {plans.filter(p => p.budget_categories?.type === 'expense' && p.planned_amount > 0).length === 0 ? (
          <div style={{ color: '#7a8499', fontSize: 13 }}>Бюджет не настроен. Перейдите в раздел "Бюджет"</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plans.filter(p => p.budget_categories?.type === 'expense' && p.planned_amount > 0).map(plan => {
              const spent = transactions.filter(t => t.category_id === plan.category_id && t.type === 'expense').reduce((a, t) => a + t.amount, 0)
              const pct = Math.min((spent / plan.planned_amount) * 100, 100)
              const over = spent > plan.planned_amount
              return (
                <div key={plan.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#a0aec0' }}>
                      {plan.budget_categories?.icon} {plan.budget_categories?.name}
                    </span>
                    <span style={{ fontSize: 13, color: over ? '#ef4444' : '#e8eaf0' }}>
                      {fmt(spent)} / {fmt(plan.planned_amount)} ₸
                    </span>
                  </div>
                  <div style={{ background: '#1e2535', borderRadius: 4, height: 6 }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', borderRadius: 4,
                      background: over ? '#ef4444' : pct > 80 ? '#eab308' : '#22c55e',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 16 }}>
          Последние транзакции
        </h3>
        {transactions.slice(0, 8).map(tx => (
          <div key={tx.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: '1px solid #1e2535',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{tx.budget_categories?.icon || '📦'}</span>
              <div>
                <div style={{ fontSize: 13, color: '#e8eaf0' }}>{tx.description || tx.budget_categories?.name || '—'}</div>
                <div style={{ fontSize: 11, color: '#7a8499' }}>{tx.date} · {tx.merchant || tx.source}</div>
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: tx.type === 'income' ? '#22c55e' : '#ef4444' }}>
              {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)} ₸
            </span>
          </div>
        ))}
        {transactions.length === 0 && (
          <div style={{ color: '#7a8499', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Нет транзакций в этом месяце
          </div>
        )}
      </div>
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
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
    </div>
  )
}

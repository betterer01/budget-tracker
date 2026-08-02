import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const now = new Date()

  // Load financial context
  const start = startOfMonth(now).toISOString().split('T')[0]
  const end = endOfMonth(now).toISOString().split('T')[0]
  const prev = startOfMonth(subMonths(now, 1)).toISOString().split('T')[0]
  const prevEnd = endOfMonth(subMonths(now, 1)).toISOString().split('T')[0]

  const [txRes, planRes, oblRes, prevTxRes] = await Promise.all([
    supabase.from('budget_transactions').select('*, budget_categories(name,type)').gte('date', start).lte('date', end),
    supabase.from('budget_plans').select('*, budget_categories(name,type)').eq('year', now.getFullYear()).eq('month', now.getMonth() + 1),
    supabase.from('budget_obligations').select('*').eq('is_active', true),
    supabase.from('budget_transactions').select('amount,type').gte('date', prev).lte('date', prevEnd),
  ])

  const txs = txRes.data || []
  const plans = planRes.data || []
  const obligations = oblRes.data || []
  const prevTxs = prevTxRes.data || []

  const thisMonthIncome = txs.filter(t => t.type === 'income').reduce((a: number, t: { amount: number }) => a + t.amount, 0)
  const thisMonthExpense = txs.filter(t => t.type === 'expense').reduce((a: number, t: { amount: number }) => a + t.amount, 0)
  const prevExpense = prevTxs.filter(t => t.type === 'expense').reduce((a: number, t: { amount: number }) => a + t.amount, 0)
  const dayOfMonth = now.getDate()
  const daysInMonth = endOfMonth(now).getDate()
  const predictedExpense = dayOfMonth > 0 ? (thisMonthExpense / dayOfMonth) * daysInMonth : 0

  const systemPrompt = `Ты — персональный финансовый советник семьи. Отвечай на русском языке. Будь конкретным: называй цифры в тенге (₸). Давай практичные рекомендации.

ТЕКУЩИЕ ФИНАНСОВЫЕ ДАННЫЕ (${format(now, 'MMMM yyyy')}):
- День ${dayOfMonth} из ${daysInMonth}
- Доходы этого месяца: ${thisMonthIncome.toLocaleString('ru')} ₸
- Расходы этого месяца: ${thisMonthExpense.toLocaleString('ru')} ₸
- Остаток: ${(thisMonthIncome - thisMonthExpense).toLocaleString('ru')} ₸
- Расходы прошлого месяца: ${prevExpense.toLocaleString('ru')} ₸
- Прогноз расходов до конца месяца: ${Math.round(predictedExpense).toLocaleString('ru')} ₸

ТРАНЗАКЦИИ ЭТОГО МЕСЯЦА:
${txs.slice(0, 30).map((t: { date: string; amount: number; type: string; budget_categories?: { name: string } }) => `- ${t.date}: ${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString('ru')} ₸ (${t.budget_categories?.name || 'Без категории'})`).join('\n')}

ПЛАН НА МЕСЯЦ:
${plans.map((p: { budget_categories?: { name: string; type: string }; planned_amount: number }) => `- ${p.budget_categories?.name}: ${p.planned_amount.toLocaleString('ru')} ₸ (${p.budget_categories?.type === 'income' ? 'доход' : 'расход'})`).join('\n')}

ПОСТОЯННЫЕ ОБЯЗАТЕЛЬСТВА:
${obligations.map((o: { name: string; amount: number; due_day?: number }) => `- ${o.name}: ${o.amount.toLocaleString('ru')} ₸${o.due_day ? ` (${o.due_day}-е число)` : ''}`).join('\n')}

Анализируй реальные данные. Если данных нет — скажи об этом и попроси добавить транзакции.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : 'Ошибка'
  return NextResponse.json({ reply })
}

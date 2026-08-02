import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const start = startOfMonth(now).toISOString().split('T')[0]
  const end = endOfMonth(now).toISOString().split('T')[0]

  // Current month data
  const [txRes, planRes, oblRes] = await Promise.all([
    supabase.from('budget_transactions').select('*, budget_categories(name,type,icon)').gte('date', start).lte('date', end).order('date', { ascending: false }),
    supabase.from('budget_plan_items').select('*').eq('year', currentYear).eq('month', currentMonth),
    supabase.from('budget_obligations').select('*').eq('is_active', true),
  ])

  // Last 3 months history
  const history = []
  for (let i = 3; i >= 1; i--) {
    const d = subMonths(now, i)
    const s = startOfMonth(d).toISOString().split('T')[0]
    const e = endOfMonth(d).toISOString().split('T')[0]
    const [htx, hplan] = await Promise.all([
      supabase.from('budget_transactions').select('amount,type').gte('date', s).lte('date', e),
      supabase.from('budget_plan_items').select('planned_amount,type').eq('year', d.getFullYear()).eq('month', d.getMonth() + 1),
    ])
    const income = (hplan.data || []).filter(p => p.type === 'income').reduce((a, p) => a + p.planned_amount, 0)
    const expense = (htx.data || []).filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
    history.push({ month: format(d, 'MMMM yyyy'), income, expense, saved: income - expense })
  }

  // Future months until end of year
  const futureMonths = []
  for (let m = currentMonth + 1; m <= 12; m++) {
    const { data: fplan } = await supabase.from('budget_plan_items').select('name,planned_amount,type').eq('year', currentYear).eq('month', m)
    if (fplan && fplan.length > 0) {
      const income = fplan.filter(p => p.type === 'income').reduce((a, p) => a + p.planned_amount, 0)
      const expense = fplan.filter(p => p.type === 'expense').reduce((a, p) => a + p.planned_amount, 0)
      const items = fplan.map(p => `  ${p.name}: ${p.planned_amount.toLocaleString('ru')} ₸ (${p.type === 'income' ? 'доход' : 'расход'})`).join('\n')
      futureMonths.push({ month: m, label: format(new Date(currentYear, m - 1, 1), 'MMMM yyyy'), income, expense, items })
    }
  }

  const txs = txRes.data || []
  const plans = planRes.data || []
  const obligations = oblRes.data || []

  const plannedIncome = plans.filter(p => p.type === 'income').reduce((a, p) => a + p.planned_amount, 0)
  const plannedExpense = plans.filter(p => p.type === 'expense').reduce((a, p) => a + p.planned_amount, 0)
  const actualExpense = txs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const balance = plannedIncome - actualExpense
  const day = now.getDate()
  const daysInMonth = endOfMonth(now).getDate()
  const predictedExpense = day > 0 ? (actualExpense / day) * daysInMonth : 0
  const dailyBudget = plannedExpense / daysInMonth
  const dailyActual = actualExpense / day

  const expenseByCategory: Record<string, number> = {}
  txs.filter(t => t.type === 'expense').forEach(t => {
    const name = t.budget_categories?.name || 'Прочее'
    expenseByCategory[name] = (expenseByCategory[name] || 0) + t.amount
  })

  const systemPrompt = `Ты — строгий личный финансовый советник семьи из Казахстана. Русский язык. Только конкретные цифры в тенге (₸), никакой воды.

ТВОИ ЗАДАЧИ:
1. Анализируй текущий месяц — где перерасход, где можно сэкономить
2. Смотри на будущие месяцы — видишь когда закрываются долги, что освобождается
3. Давай конкретный план по остатку: долги → подушка → накопления
4. Предупреждай заранее: "В октябре закроется X — освободится Y ₸, рекомендую направить на Z"
5. Строй картину до конца года — сколько всего будет потрачено, сколько сохранено

═══════════════════════════════
ТЕКУЩИЙ МЕСЯЦ: ${format(now, 'MMMM yyyy')}
День ${day} из ${daysInMonth}
═══════════════════════════════

ДОХОДЫ И БАЛАНС:
▸ Плановый доход: ${plannedIncome.toLocaleString('ru')} ₸
▸ Фактические расходы: ${actualExpense.toLocaleString('ru')} ₸
▸ Текущий остаток: ${balance.toLocaleString('ru')} ₸ ${balance < 0 ? '⚠️ ДЕФИЦИТ' : ''}
▸ Прогноз расходов к концу месяца: ${Math.round(predictedExpense).toLocaleString('ru')} ₸ ${predictedExpense > plannedExpense ? `⚠️ превышение на ${Math.round(predictedExpense - plannedExpense).toLocaleString('ru')} ₸` : '✅'}
▸ Темп трат: ${Math.round(dailyActual).toLocaleString('ru')} ₸/день (бюджет: ${Math.round(dailyBudget).toLocaleString('ru')} ₸/день)

РАСХОДЫ ПО КАТЕГОРИЯМ:
${Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([name, amt]) => `▸ ${name}: ${amt.toLocaleString('ru')} ₸`).join('\n') || '▸ Нет данных'}

ПЛАН ТЕКУЩЕГО МЕСЯЦА:
${plans.map(p => `▸ ${p.name}: ${p.planned_amount.toLocaleString('ru')} ₸ (${p.type === 'income' ? 'доход' : 'расход'})`).join('\n') || '▸ Бюджет не заполнен'}

ОБЯЗАТЕЛЬСТВА:
${obligations.map(o => `▸ ${o.name}: ${o.amount.toLocaleString('ru')} ₸${o.due_day ? ` · ${o.due_day}-е число` : ''}`).join('\n') || '▸ Нет'}

═══════════════════════════════
ИСТОРИЯ (последние 3 месяца)
═══════════════════════════════
${history.map(h => `▸ ${h.month}: доход ${h.income.toLocaleString('ru')} ₸, расход ${h.expense.toLocaleString('ru')} ₸, сохранено ${h.saved.toLocaleString('ru')} ₸`).join('\n') || '▸ Нет данных'}

═══════════════════════════════
БУДУЩИЕ МЕСЯЦЫ ДО КОНЦА ГОДА
═══════════════════════════════
${futureMonths.length > 0 ? futureMonths.map(fm => `
${fm.label}:
▸ Доход: ${fm.income.toLocaleString('ru')} ₸
▸ Расходы: ${fm.expense.toLocaleString('ru')} ₸
▸ Остаток: ${(fm.income - fm.expense).toLocaleString('ru')} ₸
${fm.items}`).join('\n') : '▸ Будущие месяцы не заполнены в бюджете. Попроси пользователя заполнить бюджет на оставшиеся месяцы года.'}

═══════════════════════════════
ПРАВИЛА РЕКОМЕНДАЦИЙ
═══════════════════════════════
При наличии свободных денег — рекомендуй в таком порядке:
1. Погашение кредитов с высокой ставкой (Каспи обычно 20-30% годовых)
2. Подушка безопасности если нет (3 месяца расходов = ~${Math.round(plannedExpense * 3).toLocaleString('ru')} ₸)
3. Депозит в банке (14-16% годовых в KZ)

Когда видишь что в будущем месяце исчезает статья расхода (долг закрыт) — сразу говори: сколько освободится и куда направить.

Если данных мало — скажи прямо и попроси добавить транзакции или заполнить бюджет на будущие месяцы.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : 'Ошибка'
  return NextResponse.json({ reply })
}

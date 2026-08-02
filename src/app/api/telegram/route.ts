import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(Number)

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

async function getFile(fileId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
  const data = await res.json()
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const userId = message.from?.id

  // Auth check
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
    await sendMessage(chatId, '❌ Доступ запрещён')
    return NextResponse.json({ ok: true })
  }

  const { data: categories } = await supabase.from('budget_categories').select('*').order('sort_order')
  const categoryList = (categories || []).map(c => `${c.id}: ${c.icon} ${c.name} (${c.type})`).join('\n')

  // Handle photo
  if (message.photo || message.document) {
    await sendMessage(chatId, '📷 Распознаю чек...')
    const fileId = message.photo
      ? message.photo[message.photo.length - 1].file_id
      : message.document.file_id

    const fileUrl = await getFile(fileId)
    const fileRes = await fetch(fileUrl)
    const bytes = await fileRes.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isDoc = !!message.document
    const mediaType = isDoc ? 'application/pdf' : 'image/jpeg'

    const prompt = `Распознай чек. Верни JSON:
{"amount": число, "merchant": "магазин", "description": "описание", "date": "YYYY-MM-DD или null", "category_id": "UUID или null", "type": "expense"}

Категории:
${categoryList}

Только JSON.`

    const content: Anthropic.MessageParam['content'] = mediaType === 'application/pdf'
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }]
      : [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } }, { type: 'text', text: prompt }]

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 512,
      messages: [{ role: 'user', content }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    if (parsed.amount) {
      await supabase.from('budget_transactions').insert({
        amount: parsed.amount,
        type: parsed.type || 'expense',
        category_id: parsed.category_id || null,
        merchant: parsed.merchant || null,
        description: parsed.description || null,
        date: parsed.date || new Date().toISOString().split('T')[0],
        source: 'telegram',
        receipt_data: parsed,
      })
      const cat = (categories || []).find(c => c.id === parsed.category_id)
      await sendMessage(chatId,
        `✅ <b>Записано!</b>\n\n💰 ${parsed.amount.toLocaleString('ru')} ₸\n${cat ? `${cat.icon} ${cat.name}` : '📦 Без категории'}${parsed.merchant ? `\n🏪 ${parsed.merchant}` : ''}`
      )
    } else {
      await sendMessage(chatId, '❓ Не удалось распознать чек. Введи вручную:\n\n<code>1500 продукты Магнум</code>')
    }
    return NextResponse.json({ ok: true })
  }

  // Handle text: "1500 продукты Магнум" or natural language
  if (message.text) {
    const text = message.text.trim()

    if (text === '/start') {
      await sendMessage(chatId, `👋 Привет! Я бот учёта расходов.\n\nКак добавить расход:\n• Отправь фото чека 📷\n• Напиши: <code>1500 продукты Магнум</code>\n• Напиши: <code>зарплата 900000</code>\n\nКоманды:\n/stats — статистика месяца\n/balance — текущий баланс`)
      return NextResponse.json({ ok: true })
    }

    if (text === '/stats' || text === '/balance') {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      const { data: txs } = await supabase.from('budget_transactions').select('amount,type').gte('date', start).lte('date', end)
      const income = (txs || []).filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
      const expense = (txs || []).filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
      await sendMessage(chatId,
        `📊 <b>${now.toLocaleString('ru', { month: 'long', year: 'numeric' })}</b>\n\n📈 Доходы: ${income.toLocaleString('ru')} ₸\n📉 Расходы: ${expense.toLocaleString('ru')} ₸\n💰 Остаток: ${(income - expense).toLocaleString('ru')} ₸`
      )
      return NextResponse.json({ ok: true })
    }

    // Parse natural language
    const parsePrompt = `Пользователь написал: "${text}"
Категории: ${categoryList}
Верни JSON: {"amount": число, "type": "expense" или "income", "category_id": "UUID или null", "merchant": "магазин или null", "description": "описание или null"}
Только JSON.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 256,
      messages: [{ role: 'user', content: parsePrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      if (parsed.amount) {
        await supabase.from('budget_transactions').insert({
          amount: parsed.amount,
          type: parsed.type || 'expense',
          category_id: parsed.category_id || null,
          merchant: parsed.merchant || null,
          description: parsed.description || text,
          date: new Date().toISOString().split('T')[0],
          source: 'telegram',
        })
        const cat = (categories || []).find(c => c.id === parsed.category_id)
        await sendMessage(chatId,
          `✅ <b>Записано!</b>\n\n💰 ${parsed.type === 'income' ? '+' : '-'}${parsed.amount.toLocaleString('ru')} ₸\n${cat ? `${cat.icon} ${cat.name}` : '📦 Без категории'}`
        )
      } else {
        await sendMessage(chatId, '❓ Не понял. Попробуй: <code>1500 продукты</code> или отправь фото чека.')
      }
    } catch {
      await sendMessage(chatId, '❓ Не понял сообщение. Попробуй: <code>1500 продукты Магнум</code>')
    }
  }

  return NextResponse.json({ ok: true })
}

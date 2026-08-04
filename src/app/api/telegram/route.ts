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

// Fast text parser — no AI needed
function parseTextInput(text: string, categories: { id: string; name: string; type: string; icon: string; color: string; is_fixed: boolean; sort_order: number }[]) {
  // Format: "1500 продукты Магнум" or "1500 продукты" or "продукты 1500"
  const numMatch = text.match(/(\d[\d\s]*(?:[.,]\d+)?)/)
  if (!numMatch) return null

  const amount = parseFloat(numMatch[1].replace(/\s/g, '').replace(',', '.'))
  if (!amount || amount <= 0) return null

  const textWithoutAmount = text.replace(numMatch[1], '').trim().toLowerCase()

  // Find best matching category
  let bestCategory = null
  let bestScore = 0

  for (const cat of categories) {
    const catName = cat.name.toLowerCase()
    const words = catName.split(/\s+/)
    for (const word of words) {
      if (word.length > 2 && textWithoutAmount.includes(word)) {
        const score = word.length
        if (score > bestScore) {
          bestScore = score
          bestCategory = cat
        }
      }
    }
    // Also check input words against category name
    const inputWords = textWithoutAmount.split(/\s+/)
    for (const word of inputWords) {
      if (word.length > 2 && catName.includes(word)) {
        const score = word.length
        if (score > bestScore) {
          bestScore = score
          bestCategory = cat
        }
      }
    }
  }

  return { amount, category: bestCategory, description: textWithoutAmount.trim() }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const userId = message.from?.id

    // Ignore messages from bots to prevent infinite loops
    if (message.from?.is_bot) return NextResponse.json({ ok: true })

    if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(userId)) {
      await sendMessage(chatId, '❌ Доступ запрещён')
      return NextResponse.json({ ok: true })
    }

    const { data: categories } = await supabase.from('budget_categories').select('*').order('sort_order')
    const cats = categories || []

    // Handle photo — use Claude Vision
    if (message.photo || message.document) {
      await sendMessage(chatId, '📷 Распознаю чек...')

      const fileId = message.photo
        ? message.photo[message.photo.length - 1].file_id
        : message.document.file_id

      const fileUrl = await getFile(fileId)
      const fileRes = await fetch(fileUrl)
      const bytes = await fileRes.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')

      const categoryList = cats.map(c => `${c.id}: ${c.name}`).join('\n')
      const prompt = `Распознай чек. JSON: {"amount": число, "merchant": "магазин", "description": "описание", "date": "YYYY-MM-DD или null", "category_id": "UUID или null"}\n\nКатегории:\n${categoryList}\n\nТолько JSON.`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any[] = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: prompt }
      ]

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{ role: 'user', content }],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
        if (parsed.amount) {
          await supabase.from('budget_transactions').insert({
            amount: parsed.amount,
            type: 'expense',
            category_id: parsed.category_id || null,
            merchant: parsed.merchant || null,
            description: parsed.description || null,
            date: parsed.date || new Date().toISOString().split('T')[0],
            source: 'telegram',
            receipt_data: parsed,
          })
          const cat = cats.find(c => c.id === parsed.category_id)
          await sendMessage(chatId,
            `✅ <b>Записано!</b>\n\n💰 -${parsed.amount.toLocaleString('ru')} ₸\n${cat ? `${cat.icon} ${cat.name}` : '📦 Без категории'}${parsed.merchant ? `\n🏪 ${parsed.merchant}` : ''}`
          )
        } else {
          await sendMessage(chatId, '❓ Не удалось распознать чек. Введи вручную:\n<code>1500 продукты</code>')
        }
      } catch {
        await sendMessage(chatId, '❓ Ошибка. Введи вручную:\n<code>1500 продукты</code>')
      }

      return NextResponse.json({ ok: true })
    }

    // Handle text — fast regex parser, no AI
    if (message.text) {
      const text = message.text.trim()

      if (text === '/start') {
        await sendMessage(chatId,
          `👋 Привет! Бот учёта расходов.\n\n` +
          `Как добавить расход:\n` +
          `• <code>1500 продукты</code>\n` +
          `• <code>2500 такси</code>\n` +
          `• <code>5000 кафе Магнум</code>\n` +
          `• Фото чека 📷\n\n` +
          `/balance — баланс\n` +
          `/stats — статистика`
        )
        return NextResponse.json({ ok: true })
      }

      if (text === '/balance' || text === '/stats') {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
        const { data: txs } = await supabase.from('budget_transactions').select('amount,type').gte('date', start).lte('date', end)
        const expense = (txs || []).filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
        const { data: plans } = await supabase.from('budget_plan_items').select('planned_amount,type').eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
        const income = (plans || []).filter(p => p.type === 'income').reduce((a, p) => a + p.planned_amount, 0)
        await sendMessage(chatId,
          `📊 <b>${now.toLocaleString('ru', { month: 'long', year: 'numeric' })}</b>\n\n` +
          `📈 Доход (план): ${income.toLocaleString('ru')} ₸\n` +
          `📉 Расходы (факт): ${expense.toLocaleString('ru')} ₸\n` +
          `💰 Остаток: ${(income - expense).toLocaleString('ru')} ₸`
        )
        return NextResponse.json({ ok: true })
      }

      // Fast parse text
      const parsed = parseTextInput(text, cats)
      if (parsed) {
        await supabase.from('budget_transactions').insert({
          amount: parsed.amount,
          type: 'expense',
          category_id: parsed.category?.id || null,
          description: parsed.description || text,
          date: new Date().toISOString().split('T')[0],
          source: 'telegram',
        })
        await sendMessage(chatId,
          `✅ <b>Записано!</b>\n\n` +
          `💰 -${parsed.amount.toLocaleString('ru')} ₸\n` +
          `${parsed.category ? `${parsed.category.icon} ${parsed.category.name}` : '📦 Без категории — уточни в приложении'}`
        )
      } else {
        await sendMessage(chatId,
          `❓ Не понял. Напиши так:\n<code>1500 продукты</code>\n\nИли отправь фото чека 📷`
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}

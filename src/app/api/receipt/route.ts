import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const { data: categories } = await supabase.from('budget_categories').select('*').eq('type', 'expense')

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type

  const categoryList = (categories || []).map(c => `${c.id}: ${c.name}`).join('\n')

  const prompt = `Распознай чек и верни JSON с полями:
{
  "amount": число (итоговая сумма в тенге),
  "merchant": "название магазина или заведения",
  "description": "краткое описание покупки",
  "date": "YYYY-MM-DD если есть на чеке",
  "category_id": "UUID из списка подходящей категории или null",
  "items": [{"name": "товар", "price": число}]
}

Доступные категории:
${categoryList}

Верни ТОЛЬКО JSON без markdown и пояснений.`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let content: any[]

  if (mediaType === 'application/pdf') {
    content = [
      { type: 'text', text: prompt + '\n\nФайл PDF прикреплён как изображение — опиши что видишь и распознай данные чека.' }
    ]
  } else {
    content = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: base64
        }
      },
      { type: 'text', text: prompt }
    ]
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Parse error', raw: text }, { status: 422 })
  }
}

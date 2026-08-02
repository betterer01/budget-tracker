import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Category = {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  is_fixed: boolean
  sort_order: number
}

export type Transaction = {
  id: string
  user_id: string | null
  category_id: string | null
  amount: number
  type: 'expense' | 'income'
  description: string | null
  merchant: string | null
  date: string
  receipt_url: string | null
  receipt_data: Record<string, unknown> | null
  source: 'manual' | 'telegram' | 'receipt_photo' | 'receipt_pdf'
  created_at: string
  budget_categories?: Category
}

export type BudgetPlan = {
  id: string
  year: number
  month: number
  category_id: string
  planned_amount: number
  budget_categories?: Category
}

export type Obligation = {
  id: string
  name: string
  amount: number
  due_day: number | null
  category_id: string | null
  is_active: boolean
  end_date: string | null
  notes: string | null
}

export type AIInsight = {
  id: string
  year: number
  month: number
  insight_type: string
  content: string
  data: Record<string, unknown> | null
  created_at: string
}

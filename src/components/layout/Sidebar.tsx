'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard',    icon: '📊', label: 'Дашборд' },
  { href: '/transactions', icon: '💸', label: 'Транзакции' },
  { href: '/budget',       icon: '📋', label: 'Бюджет' },
  { href: '/savings',      icon: '🏦', label: 'Сбережения' },
  { href: '/ai',           icon: '🤖', label: 'ИИ-финансист' },
  { href: '/settings',     icon: '⚙️', label: 'Настройки' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{
      width: 240, position: 'fixed', top: 0, left: 0, bottom: 0,
      background: '#161b27', borderRight: '1px solid #1e2535',
      display: 'flex', flexDirection: 'column', padding: '24px 16px', zIndex: 100,
    }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e8eaf0', letterSpacing: '-0.5px' }}>💰 Бюджет</div>
        <div style={{ fontSize: 12, color: '#7a8499', marginTop: 4 }}>Семейные финансы</div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nav.map(item => {
          const active = path.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 8, textDecoration: 'none',
              fontSize: 14, fontWeight: active ? 600 : 400,
              color: active ? '#e8eaf0' : '#7a8499',
              background: active ? '#1e2535' : 'transparent',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div style={{ marginTop: 'auto', fontSize: 11, color: '#4a5568', lineHeight: 1.5 }}>
        Telegram: @fin_assistant1_bot
      </div>
    </aside>
  )
}

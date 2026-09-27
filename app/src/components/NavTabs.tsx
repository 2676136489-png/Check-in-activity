import type { TabKey } from '@/types'

interface Props {
  active: TabKey
  onChange: (t: TabKey) => void
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'board', label: '看板' },
  { key: 'week', label: '周报' },
  { key: 'mine', label: '我的' },
]

/** 底部导航（移动端）+ 顶部标签（桌面端） */
export function NavTabs({ active, onChange }: Props) {
  return (
    <>
      {/* 桌面：顶部 tab */}
      <nav className="hidden md:flex px-5 gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.key
                ? 'border-ink text-ink'
                : 'border-transparent text-muted hover:text-ink-600'
            }`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {/* 移动：底部导航 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-paper/95 backdrop-blur border-t border-hairline z-10">
        <div className="grid grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`py-2.5 text-xs font-medium ${
                active === t.key ? 'text-ink' : 'text-muted'
              }`}
              onClick={() => onChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}

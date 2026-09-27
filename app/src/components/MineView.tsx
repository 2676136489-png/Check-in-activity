import { useRef } from 'react'
import type { Goal, Log, Review } from '@/types'

interface Props {
  onExport: () => Promise<{ goals: Goal[]; logs: Log[]; reviews: Review[] }>
  onImport: (data: { goals: Goal[]; logs: Log[]; reviews: Review[] }) => Promise<void>
  repoKind: string
}

/** 我的页：数据备份还原 + 说明 */
export function MineView({ onExport, onImport, repoKind }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    const data = await onExport()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `learning-goals-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const data = JSON.parse(text)
      await onImport(data)
      alert('导入成功')
    } catch {
      alert('文件格式错误')
    }
    e.target.value = ''
  }

  return (
    <section className="px-5 space-y-4">
      <h2 className="serif text-lg font-semibold">我的</h2>

      <div className="card space-y-3">
        <h3 className="font-medium">数据管理</h3>
        <p className="text-xs text-muted">
          当前存储：{repoKind === 'indexeddb' ? '本地 IndexedDB（离线可用）' : 'Supabase 云端'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={handleExport}>导出 JSON</button>
          <button className="btn-ghost hairline" onClick={() => fileRef.current?.click()}>
            导入 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>

      <div className="card space-y-2 text-sm">
        <h3 className="font-medium">关于这个项目</h3>
        <p className="text-muted">
          学习目标管理台是一个用于追踪学习进度的工具。核心算法基于「近 7 天回溯 + 每周休息日 +
          ETA 预测」，帮你判断目标是否能在截止日前完成。
        </p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted">
          <li>添加目标，设定总量和截止日</li>
          <li>每天打卡，记录完成量与耗时</li>
          <li>看板查看进度环与 ETA</li>
          <li>每周做一次四格复盘</li>
        </ol>
      </div>
    </section>
  )
}

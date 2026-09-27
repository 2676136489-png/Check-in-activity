import { useState } from 'react'
import { colorAt } from '@/lib/palette'
import { isoDate, offsetDays } from '@/lib/date'
import type { Goal } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (g: Omit<Goal, 'id' | 'createdAt'>) => Promise<void>
}

/** 新增目标弹层 */
export function AddGoal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [total, setTotal] = useState(100)
  const [unit, setUnit] = useState('个')
  const [dueDays, setDueDays] = useState(30)
  const [obstacle, setObstacle] = useState('')
  const [countermeasure, setCountermeasure] = useState('')

  if (!open) return null

  const handleSubmit = async () => {
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      unit: unit.trim() || '个',
      total: Number(total) || 0,
      due: offsetDays(Number(dueDays) || 30, isoDate()),
      color: colorAt(Math.floor(Math.random() * 8)),
      obstacle: obstacle.trim() || undefined,
      countermeasure: countermeasure.trim() || undefined,
      isSeed: false,
      order: Date.now(),
    })
    setName(''); setTotal(100); setUnit('个'); setDueDays(30)
    setObstacle(''); setCountermeasure('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink-700/30" onClick={onClose}>
      <div
        className="bg-paper w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="serif text-xl font-bold mb-4">添加目标</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">目标名称</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：背完 2000 个单词" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">总量</label>
              <input type="number" className="input" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">单位</label>
              <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">多少天后截止</label>
            <input type="number" className="input" value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">最大障碍（可选）</label>
            <input className="input" value={obstacle} onChange={(e) => setObstacle(e.target.value)} placeholder="一句话" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">对策（可选）</label>
            <input className="input" value={countermeasure} onChange={(e) => setCountermeasure(e.target.value)} placeholder="一句话" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="btn-ghost hairline flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={handleSubmit}>添加</button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { isoDate, mondayOf } from '@/lib/date'
import type { Review } from '@/types'

interface Props {
  reviews: Review[]
  onSubmit: (r: Omit<Review, 'id' | 'createdAt'>) => Promise<void>
}

/** 周复盘：四格法（保持 / 问题 / 尝试 / 下周预案） */
export function WeekReview({ reviews, onSubmit }: Props) {
  const [keep, setKeep] = useState('')
  const [problem, setProblem] = useState('')
  const [tryField, setTryField] = useState('')
  const [next, setNext] = useState('')

  const weekStart = mondayOf(isoDate())
  const existing = reviews.find((r) => r.weekStart === weekStart)

  const handleSubmit = async () => {
    await onSubmit({ weekStart, keep, problem, try: tryField, nextWeekPlan: next })
    setKeep(''); setProblem(''); setTryField(''); setNext('')
  }

  const fields = [
    { label: '保持', value: keep, set: setKeep, placeholder: '这一周哪些做法有效，想继续？' },
    { label: '问题', value: problem, set: setProblem, placeholder: '哪些事拖了后腿？' },
    { label: '尝试', value: tryField, set: setTryField, placeholder: '下周想试什么新做法？' },
    { label: '下周预案', value: next, set: setNext, placeholder: '如果 X 发生，就 Y' },
  ]

  return (
    <section className="px-5 space-y-4">
      <div>
        <h2 className="serif text-lg font-semibold">本周复盘</h2>
        <p className="text-xs text-muted mt-1">周起始 {weekStart} · 每周只留一份，覆盖写入</p>
      </div>

      {existing && (
        <div className="card space-y-2 text-sm">
          <p className="text-xs text-muted">已保存的复盘：</p>
          <p><strong>保持：</strong>{existing.keep}</p>
          <p><strong>问题：</strong>{existing.problem}</p>
          <p><strong>尝试：</strong>{existing.try}</p>
          <p><strong>下周预案：</strong>{existing.nextWeekPlan}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label}>
            <label className="block text-xs font-medium text-ink-600 mb-1">{f.label}</label>
            <textarea
              className="input min-h-[72px] resize-none"
              placeholder={f.placeholder}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            />
          </div>
        ))}
      </div>
      <button className="btn-primary w-full" onClick={handleSubmit}>
        保存本周复盘
      </button>
    </section>
  )
}

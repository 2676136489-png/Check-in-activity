/**
 * 空态 —— 第一次打开页面时看到的东西
 *
 * 这个组件的存在理由很实际：数据的默认存储是浏览器本地 IndexedDB，
 * 所以任何人第一次打开都是一张白纸。如果只是显示「暂无数据」，
 * 页面看起来就像坏了一样 —— 而它其实是好的，只是还没有内容。
 *
 * 所以这里给两条明确的路：自己建一个目标，或者先载入示例数据看效果。
 */
interface Props {
  onLoadSample: () => void
  onAddGoal: () => void
}

export function EmptyState({ onLoadSample, onAddGoal }: Props) {
  return (
    <section className="px-5">
      <div className="card px-6 py-10 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-ink-50 flex items-center justify-center">
          <span className="serif text-2xl text-ink leading-none">目</span>
        </div>

        <h2 className="serif text-xl font-bold mb-2">这里还没有目标</h2>

        <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
          数据默认存在这台设备的浏览器里（IndexedDB），所以第一次打开是一张白纸——
          <span className="text-ink-600">不是加载失败</span>。
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
          <button className="btn-primary" onClick={onLoadSample}>
            载入示例数据
          </button>
          <button className="btn-ghost hairline" onClick={onAddGoal}>
            新建一个目标
          </button>
        </div>

        <p className="text-xs text-muted mt-5 leading-relaxed">
          示例数据是四组带 14 天打卡记录的目标，
          <br className="hidden sm:block" />
          能同时看到「推进中 / 可能延期 / 已逾期 / 已完成」四种状态。
          之后可以在「我的」里一键清除。
        </p>
      </div>
    </section>
  )
}

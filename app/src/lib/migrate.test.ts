/**
 * 备份迁移的测试
 *
 * 这段代码是「数据搬过来」的唯一入口，出问题的形式都很安静：
 * 字段名没认出来 → 障碍/对策变成空白；记录挂错目标 → 进度环上的数字偏低；
 * 缺 id 没补上 → put() 抛 DataError，界面只报「文件格式错误」。
 * 所以这里不测「函数被调用了」，而是逐字段断言转换结果，外加两条防数据丢失的硬约束：
 * 备份里没有目标时必须抛错（否则会先清空再写入，等于删库），以及工程化版备份往返必须不变。
 */
import { describe, expect, it } from 'vitest'
import { BackupFormatError, describeImport, detectSource, normalizeBackup } from './migrate'

const NOW = '2026-09-27T10:00:00.000Z'
const TODAY = '2026-09-27'

/** 注入确定性 id / 日期，方便断言 */
function opts() {
  let n = 0
  return { today: TODAY, nowIso: NOW, idFactory: () => `new-${++n}` }
}

/** 单文件版 doExport() 的真实产物形状 */
const LEGACY = {
  v: 1,
  exportedAt: '2026-09-20T08:30:00.000Z',
  goals: [
    {
      name: '英语单词',
      unit: '词',
      total: 1200,
      due: '2026-12-31',
      color: '#2c6b5c',
      blocker: '晚上容易走神',
      counter: '固定在通勤路上背',
      seed: false,
      sort: 0,
    },
    { name: '算法题', unit: '题', total: 200, due: '2026-11-15', color: '#9a6b2e', blocker: '', counter: '', seed: true, sort: 1 },
  ],
  logs: [
    { goalName: '英语单词', date: '2026-09-26', amount: 30, minutes: 25, makeup: false },
    { goalName: '英语单词', date: '2026-09-27', amount: 20, minutes: null, makeup: true },
    { goalName: '算法题', date: '2026-09-27', amount: 2, minutes: 90, makeup: false },
  ],
  reviews: [
    { week: '2026-09-21', keep: '通勤背词', issue: '周末断了', tryIt: '周末补一节', plan: '下周日均 30 词' },
  ],
}

describe('detectSource', () => {
  it('单文件版备份（只有 blocker/sort 这类键）判为 legacy', () => {
    expect(detectSource(LEGACY)).toBe('legacy')
  })

  it('工程化版备份（有 id/order）判为 native', () => {
    expect(
      detectSource({ goals: [{ id: 'g1', name: 'x', unit: '个', total: 1, due: TODAY, color: '#000', order: 0 }] }),
    ).toBe('native')
  })

  it('目标列表为空时靠 records 兜底判断', () => {
    expect(detectSource({ goals: [], logs: [{ goalId: 'g1', date: TODAY, amount: 1 }], reviews: [] })).toBe('native')
    expect(detectSource({ goals: [], logs: [{ goalName: 'x', date: TODAY, amount: 1 }], reviews: [] })).toBe('legacy')
  })
})

describe('单文件版备份 → 工程化版字段', () => {
  const r = normalizeBackup(LEGACY, opts())

  it('source 与计数正确', () => {
    expect(r.source).toBe('legacy')
    expect(r.counts).toEqual({ goals: 2, logs: 3, reviews: 1 })
    expect(r.warnings).toEqual([])
  })

  it('blocker/counter/seed/sort 分别映射到 obstacle/countermeasure/isSeed/order', () => {
    const [word, algo] = r.bundle.goals
    expect(word.obstacle).toBe('晚上容易走神')
    expect(word.countermeasure).toBe('固定在通勤路上背')
    expect(word.isSeed).toBe(false)
    expect(word.order).toBe(0)
    expect(algo.isSeed).toBe(true)
    expect(algo.order).toBe(1)
    // 空字符串不落成 ''，而是 undefined，界面上才「等于没有」
    expect(algo.obstacle).toBeUndefined()
    expect(algo.countermeasure).toBeUndefined()
  })

  it('补出唯一 id 与 createdAt（单文件版备份里没有这两个字段）', () => {
    const ids = r.bundle.goals.map((g) => g.id)
    expect(ids).toEqual(['new-1', 'new-2'])
    expect(new Set(ids).size).toBe(2)
    expect(r.bundle.goals[0].createdAt).toBe(NOW)
  })

  it('打卡记录按目标名挂上 goalId，并同步 goalName', () => {
    expect(r.bundle.logs.map((l) => [l.goalId, l.goalName])).toEqual([
      ['new-1', '英语单词'],
      ['new-1', '英语单词'],
      ['new-2', '算法题'],
    ])
  })

  it('makeup 映射到 backfilled；minutes 为 null 时不写成 0', () => {
    expect(r.bundle.logs.map((l) => l.backfilled)).toEqual([false, true, false])
    expect(r.bundle.logs[0].minutes).toBe(25)
    expect(r.bundle.logs[1].minutes).toBeUndefined()
  })

  it('复盘字段映射：week→weekStart、issue→problem、tryIt→try、plan→nextWeekPlan', () => {
    expect(r.bundle.reviews[0]).toMatchObject({
      weekStart: '2026-09-21',
      keep: '通勤背词',
      problem: '周末断了',
      try: '周末补一节',
      nextWeekPlan: '下周日均 30 词',
    })
  })
})

describe('缺字段时的默认值', () => {
  it('截止日缺失 → 今天 + 30 天（与单文件版新建目标的默认一致）', () => {
    const r = normalizeBackup({ goals: [{ name: '读书' }] }, opts())
    expect(r.bundle.goals[0].due).toBe('2026-10-27')
  })

  it('单位缺失 → 个；总量缺失 / 0 / 负数 → 1', () => {
    const r = normalizeBackup(
      { goals: [{ name: 'a' }, { name: 'b', total: 0 }, { name: 'c', total: -5 }] },
      opts(),
    )
    expect(r.bundle.goals.map((g) => g.unit)).toEqual(['个', '个', '个'])
    expect(r.bundle.goals.map((g) => g.total)).toEqual([1, 1, 1])
  })

  it('配色缺失 → 按顺序取色板，保证多目标之间不撞色', () => {
    const r = normalizeBackup({ goals: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, opts())
    const colors = r.bundle.goals.map((g) => g.color)
    expect(new Set(colors).size).toBe(3)
  })

  it('数字写成字符串（表格导出常见）也能读成数字', () => {
    const r = normalizeBackup(
      { goals: [{ name: 'a', total: '300' }], logs: [{ goalName: 'a', date: TODAY, amount: '12.5', minutes: '' }] },
      opts(),
    )
    expect(r.bundle.goals[0].total).toBe(300)
    expect(r.bundle.logs[0].amount).toBe(12.5)
    expect(r.bundle.logs[0].minutes).toBeUndefined()
  })

  it('日期带时间戳（2026-09-27T00:00:00Z）只取日期部分', () => {
    const r = normalizeBackup(
      { goals: [{ name: 'a' }], logs: [{ goalName: 'a', date: '2026-09-26T00:00:00.000Z', amount: 1 }] },
      opts(),
    )
    expect(r.bundle.logs[0].date).toBe('2026-09-26')
  })

  it('日期不合法 → 目标记今天，记录也记今天（宁可记错日期，也不丢这条记录）', () => {
    const r = normalizeBackup(
      { goals: [{ name: 'a', due: '不是日期' }], logs: [{ goalName: 'a', date: '9/26', amount: 1 }] },
      opts(),
    )
    expect(r.bundle.goals[0].due).toBe('2026-10-27')
    expect(r.bundle.logs[0].date).toBe(TODAY)
  })
})

describe('损坏 / 残缺数据：跳过并说明，不静默丢', () => {
  it('没有名称的目标被跳过，并给出条数', () => {
    const r = normalizeBackup({ goals: [{ name: '  ' }, { name: '读书' }] }, opts())
    expect(r.counts.goals).toBe(1)
    expect(r.warnings).toContain('跳过 1 个没有名称的目标')
  })

  it('找不到对应目标的打卡记录被跳过，并给出条数', () => {
    const r = normalizeBackup(
      { goals: [{ name: '英语' }], logs: [{ goalName: '英语', date: TODAY, amount: 1 }, { goalName: '数学', date: TODAY, amount: 2 }] },
      opts(),
    )
    expect(r.counts.logs).toBe(1)
    expect(r.warnings).toContain('跳过 1 条打卡记录（找不到对应的目标）')
  })

  it('goalId 失配时退回按目标名匹配', () => {
    const r = normalizeBackup(
      { goals: [{ id: 'g9', name: '英语' }], logs: [{ goalId: '过期的id', goalName: '英语', date: TODAY, amount: 1 }] },
      opts(),
    )
    expect(r.bundle.logs[0].goalId).toBe('g9')
  })

  it('没有周起始日期的复盘被跳过', () => {
    const r = normalizeBackup({ goals: [{ name: 'a' }], reviews: [{ keep: '无周次' }, { week: '2026-09-21' }] }, opts())
    expect(r.counts.reviews).toBe(1)
    expect(r.warnings).toContain('跳过 1 条没有周起始日期的复盘')
  })

  it('重名目标给出提示（打卡记录只会挂到第一个上）', () => {
    const r = normalizeBackup({ goals: [{ name: '同名' }, { name: '同名' }] }, opts())
    expect(r.warnings).toContain('1 个目标重名，同名打卡记录会挂到第一个上')
  })

  it('同一周两条复盘：后来的覆盖前面的，并说明', () => {
    const r = normalizeBackup(
      { goals: [{ name: 'a' }], reviews: [{ week: '2026-09-21', keep: '旧' }, { week: '2026-09-21', keep: '新' }] },
      opts(),
    )
    expect(r.counts.reviews).toBe(1)
    expect(r.bundle.reviews[0].keep).toBe('新')
    expect(r.warnings).toContain('1 条同一周的复盘被较新的覆盖')
  })

  it('logs / reviews 不是数组时按空处理，不抛错', () => {
    const r = normalizeBackup({ goals: [{ name: 'a' }], logs: '坏数据', reviews: null }, opts())
    expect(r.counts).toEqual({ goals: 1, logs: 0, reviews: 0 })
  })
})

describe('必须拦住的输入', () => {
  it('不是对象 / 没有 goals 数组 → BackupFormatError', () => {
    expect(() => normalizeBackup(null)).toThrow(BackupFormatError)
    expect(() => normalizeBackup('{}')).toThrow(BackupFormatError)
    expect(() => normalizeBackup({ logs: [] })).toThrow(BackupFormatError)
  })

  it('备份里一个目标都没有 → 抛错中止（否则会先清空再写入，等于删库）', () => {
    expect(() => normalizeBackup({ goals: [], logs: [{ goalName: 'x' }], reviews: [] })).toThrow(/没有任何目标/)
  })

  it('目标全部没有名称 → 抛错，并说明是名称问题', () => {
    expect(() => normalizeBackup({ goals: [{ total: 5 }, {}] })).toThrow(/都没有名称/)
  })

  it('抛出的 message 是中文，能直接展示', () => {
    try {
      normalizeBackup({ goals: [] })
      throw new Error('不该走到这里')
    } catch (e) {
      expect(e).toBeInstanceOf(BackupFormatError)
      expect((e as Error).name).toBe('BackupFormatError')
      expect((e as Error).message).toMatch(/[\u4e00-\u9fa5]/)
    }
  })
})

describe('工程化版备份往返', () => {
  const native = {
    goals: [
      {
        id: 'g1',
        name: '英语单词',
        unit: '词',
        total: 1200,
        due: '2026-12-31',
        color: '#2c6b5c',
        obstacle: '走神',
        countermeasure: '通勤背',
        isSeed: true,
        order: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    logs: [
      {
        id: 'l1',
        goalId: 'g1',
        goalName: '英语单词',
        date: '2026-09-26',
        amount: 30,
        minutes: 25,
        backfilled: false,
        createdAt: '2026-09-26T00:00:00.000Z',
      },
    ],
    reviews: [
      {
        id: 'r1',
        weekStart: '2026-09-21',
        keep: 'k',
        problem: 'p',
        try: 't',
        nextWeekPlan: 'n',
        createdAt: '2026-09-21T00:00:00.000Z',
      },
    ],
  }

  it('导出的东西再导入，应当逐字段不变（id / createdAt 保留）', () => {
    const r = normalizeBackup(native, { today: TODAY, nowIso: NOW, idFactory: () => '不该被用到' })
    expect(r.source).toBe('native')
    expect(r.bundle).toEqual(native)
    expect(r.warnings).toEqual([])
  })
})

describe('describeImport', () => {
  it('有警告时把条数一并说清', () => {
    const s = describeImport({
      source: 'legacy',
      counts: { goals: 2, logs: 3, reviews: 1 },
      warnings: ['跳过 1 条打卡记录（找不到对应的目标）'],
    })
    expect(s).toContain('单文件版')
    expect(s).toContain('2 个目标')
    expect(s).toContain('跳过 1 条打卡记录')
  })

  it('没有警告时不出现「注意」', () => {
    const s = describeImport({ source: 'native', counts: { goals: 1, logs: 0, reviews: 0 }, warnings: [] })
    expect(s).not.toContain('注意')
    expect(s).toContain('工程化版')
  })
})

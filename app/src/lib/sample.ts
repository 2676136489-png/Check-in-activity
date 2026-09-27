/**
 * 示例数据 —— 让第一次打开页面的人（以及面试官）立刻看到「有数据时是什么样」
 *
 * 两个设计约束：
 *
 * 1. **日期相对 today 生成，不写死。** 否则不管哪天打开，记录都停在同一个历史区间，
 *    会看到「最近 14 天一张图都是空的」这种一眼假的效果。这里改成相对偏移，
 *    因此无论哪天打开，看板上都会有正在推进、已逾期、可能延期的目标。
 *
 * 2. **纯函数。** 给同一个 today，输出永远相同（id、createdAt 都是算出来的，
 *    不取 `new Date()`）。这样才能被确定性测试，也能断言它确实覆盖了四种状态。
 */
import type { Goal, Log, Review } from '@/types'
import { colorAt } from './palette'
import { isoDate, mondayOf, offsetDays } from './date'

interface SeedGoal {
  key: string
  name: string
  unit: string
  total: number
  /** 截止日相对今天的偏移；负数表示已经逾期 */
  dueIn: number
  obstacle?: string
  countermeasure?: string
  /**
   * 14 天的完成量，下标 0 = 13 天前，下标 13 = 今天。0 表示那天没打卡。
   * 写成显式数组而不是公式：一眼能看出累计完成了多少，也方便调状态。
   */
  plan: number[]
  /** 与 plan 一一对应的分钟数；0 表示那天没填（图表会跳过，不硬凑） */
  minutes: number[]
}

/* 四组目标刻意覆盖四种状态：on-track / overdue / at-risk / done。
   四种状态都能在看板上同时看到，比只给一组「正常推进」更能说明问题。 */
const SEEDS: SeedGoal[] = [
  {
    key: 'words',
    name: '背完考研核心词',
    unit: '个',
    total: 2000,
    dueIn: 45,
    obstacle: '晚上一躺下就开始刷手机',
    countermeasure: '把手机放到客厅，先背 20 个再拿回来',
    plan: [120, 0, 90, 150, 0, 80, 110, 60, 0, 130, 100, 0, 90, 70],
    minutes: [40, 0, 25, 45, 0, 30, 35, 20, 0, 40, 30, 0, 25, 20],
  },
  {
    key: 'sapiens',
    name: '读完《人类简史》',
    unit: '页',
    total: 440,
    dueIn: -3,
    obstacle: '加班回来太累，翻开书就想睡',
    countermeasure: '只看 10 页也算数',
    plan: [18, 0, 12, 22, 0, 15, 10, 0, 20, 14, 0, 16, 12, 0],
    minutes: [30, 0, 20, 35, 0, 25, 15, 0, 30, 20, 0, 25, 18, 0],
  },
  {
    key: 'python',
    name: 'Python 入门课',
    unit: '节',
    total: 60,
    dueIn: 10,
    obstacle: '卡在装饰器那节，看两遍没懂就不想往下走',
    countermeasure: '先跳过去往后看，回头再补',
    plan: [2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 1, 3, 0, 2],
    minutes: [50, 25, 0, 70, 45, 0, 25, 50, 0, 45, 25, 70, 0, 45],
  },
  {
    key: 'stats',
    name: '听完《概率论》公开课',
    unit: '讲',
    total: 24,
    dueIn: -10,
    // 这组已经做完，用来演示「已完成」态：即使是逾期的截止日，也不该再报红。
    plan: [2, 2, 1, 2, 0, 2, 2, 3, 1, 2, 2, 0, 3, 2],
    minutes: [60, 60, 30, 60, 0, 55, 65, 90, 30, 60, 60, 0, 90, 60],
  },
]

const DAYS = 14

export function buildSampleData(today: string = isoDate()): {
  goals: Goal[]
  logs: Log[]
  reviews: Review[]
} {
  const goals: Goal[] = []
  const logs: Log[] = []

  SEEDS.forEach((s, gi) => {
    const goalId = `seed-goal-${s.key}`
    goals.push({
      id: goalId,
      name: s.name,
      unit: s.unit,
      total: s.total,
      due: offsetDays(s.dueIn, today),
      color: colorAt(gi),
      obstacle: s.obstacle,
      countermeasure: s.countermeasure,
      isSeed: true,
      order: gi,
      createdAt: `${offsetDays(-DAYS + 1, today)}T08:00:00.000Z`,
    })

    for (let i = 0; i < DAYS; i++) {
      const amount = s.plan[i] ?? 0
      if (amount <= 0) continue
      const date = offsetDays(i - (DAYS - 1), today)
      const minutes = s.minutes[i] ?? 0
      logs.push({
        id: `seed-log-${s.key}-${i}`,
        goalId,
        goalName: s.name,
        date,
        amount,
        // 没填分钟就不写这个字段 —— 图表靠「有没有值」判断，不能塞 0 冒充
        ...(minutes > 0 ? { minutes } : {}),
        // 时间较早的几条标成补记，顺带演示补记态
        ...(i < DAYS - 7 ? { backfilled: true } : {}),
        createdAt: `${date}T21:30:00.000Z`,
      })
    }
  })

  const reviews: Review[] = [
    {
      id: 'seed-review-current',
      weekStart: mondayOf(today),
      keep: '早上通勤背单词效率最高，那 40 分钟基本不会被别的事挤掉。',
      problem: '《人类简史》已经逾期了。晚上到家基本没有精力翻书，一直往后拖。',
      try: '把「读书」挪到午休，先读 10 页再吃饭；晚上不安排需要动脑的任务。',
      nextWeekPlan: '21 点还没开始就只做最低量（10 页 / 20 个词），不允许自己归零。',
      createdAt: `${today}T22:00:00.000Z`,
    },
  ]

  return { goals, logs, reviews }
}

/** 数据里是否含示例目标（用于决定要不要显示「清除示例数据」） */
export function hasSampleData(goals: Goal[]): boolean {
  return goals.some((g) => g.isSeed)
}

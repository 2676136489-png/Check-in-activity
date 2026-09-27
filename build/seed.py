# -*- coding: utf-8 -*-
"""把预置示例数据写入线上三张表（幂等：先清旧示例，再写新示例）。

为什么必须先清：
    `batch_add_database_records.py` 是**纯追加**接口，没有任何去重逻辑。
    直接重跑 = 又写一份示例数据 → 线上出现重复目标（本项目真实踩过这个坑）。

顺序：
    1) 删除所有「是否示例=true」的目标，以及挂在这些目标上的打卡记录
    2) 复盘按「周起始」做更新或新建（不重复插入）
    3) 写入示例目标 → 取回真实 record_id → 写入打卡记录（用真实 id 关联）

用法：
    python build/seed.py            # 幂等：清旧 + 写新，重复跑结果一致
    python build/seed.py --dry-run  # 只打印将要做的事，不写线上
"""
import argparse
import json
import subprocess
import sys
from datetime import date, timedelta

PY = r"C:/Users/111/.workbuddy/binaries/python/versions/3.13.12/python.exe"
LIB = r"C:/Users/111/AppData/Local/Programs/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library/database"
DB_GOALS = "BIidtdjTZqaX8pBamGfpwG"
DB_LOGS = "EWKqAtHl8V6s9UaAHpYd69"
DB_REVIEWS = "bMjplT6TsrTmhwH8BxZKIE"

today = date.today()
n = lambda k: (today + timedelta(days=k)).isoformat()  # noqa: E731


def monday_of(d):
    return d - timedelta(days=d.weekday())


# ---------------------------------------------------------------- 接口封装
def run_script(script, *args, stdin_json=None):
    cmd = [PY, f"{LIB}/{script}", *args]
    inp = json.dumps(stdin_json, ensure_ascii=False) if stdin_json is not None else None
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", input=inp)
    if r.returncode != 0:
        print(f"FAIL {script}: {(r.stderr or '')[-400:]}", file=sys.stderr)
        sys.exit(1)
    out = (r.stdout or "").strip()
    try:
        return json.loads(out)
    except Exception:
        return {"_raw": out}


def query(db_id, flt=None):
    body = {"database_id": db_id}
    if flt:
        body["filter"] = flt
    return run_script("query_database_record.py", "--stdin", "--page-size", "200", stdin_json=body)


def batch_delete(db_id, ids):
    """每次最多 100 条，自动分批。"""
    for i in range(0, len(ids), 100):
        run_script("batch_delete_database_records.py", "--stdin",
                   stdin_json={"database_id": db_id, "record_ids": ids[i:i + 100]})
    return len(ids)


def batch_add(db_id, records):
    # 注意：--records 接收裸数组，不是 {"records": [...]} 包装
    return run_script("batch_add_database_records.py", "--database-id", db_id,
                      "--records", json.dumps(records, ensure_ascii=False))


def ids_of(out):
    got = []
    data = out if isinstance(out, dict) else {}
    res = (data.get("data") or {}).get("results") or data.get("results") or []
    for it in res:
        rid = it.get("record_id") or it.get("id")
        if rid:
            got.append(rid)
    if not got:
        got = [it.get("record_id") or it.get("id") for it in (data.get("records") or []) if it]
    return got


# ---------------------------------------------------------------- 示例数据
goals = [
    {"名称": {"text": "背英语单词"}, "单位": {"text": "个"}, "总量": {"number": 2000},
     "截止日": {"date": n(45) + "T00:00:00.000Z"}, "配色": {"text": "#2c6b5c"},
     "障碍": {"text": "晚上躺下就刷手机"},
     "对策": {"text": "手机放客厅，先背 20 个"},
     "是否示例": {"checkbox": True}, "排序": {"number": 1}},
    {"名称": {"text": "读《人类简史》"}, "单位": {"text": "页"}, "总量": {"number": 440},
     "截止日": {"date": n(30) + "T00:00:00.000Z"}, "配色": {"text": "#9a6b2e"},
     "障碍": {"text": "通勤地铁太挤"},
     "对策": {"text": "改听音频版"},
     "是否示例": {"checkbox": True}, "排序": {"number": 2}},
    {"名称": {"text": "Python 入门课"}, "单位": {"text": "节"}, "总量": {"number": 60},
     "截止日": {"date": n(-2) + "T00:00:00.000Z"}, "配色": {"text": "#a2382c"},
     "障碍": {"text": "一卡住就想换"},
     "对策": {"text": "每天只做 1 节"},
     "是否示例": {"checkbox": True}, "排序": {"number": 3}},
]

# (目标序号, 偏移天, 打卡量, 分钟数 or None, 是否补记)
log_spec = [
    (0, -8, 40, 30, False), (0, -7, 45, 32, False), (0, -6, 35, 25, False),
    (0, -5, 50, 35, False), (0, -4, 30, 20, False), (0, -3, 40, 28, False),
    (0, -2, 45, 30, True),                                    # 补记
    (1, -6, 20, 35, False), (1, -5, 18, 30, False),
    (1, -4, 22, None, False),                                 # 未填分钟
    (1, -3, 15, 25, False), (1, -2, 25, 45, False), (1, -1, 20, 33, False),
    (2, -12, 2, 50, False), (2, -10, 1, 40, False), (2, -9, 2, 55, False),
    (2, -8, 1, 30, False), (2, -6, 3, 70, False), (2, -5, 2, 45, False),
]
names = {0: "背英语单词", 1: "读《人类简史》", 2: "Python 入门课"}


def log_rec(gi, k, a, m, mk, goal_id):
    r = {"目标ID": {"text": goal_id}, "目标名": {"text": names[gi]},
         "日期": {"date": n(k) + "T00:00:00.000Z"}, "打卡量": {"number": a},
         "补记": {"checkbox": bool(mk)}}
    if m is not None:
        r["分钟数"] = {"number": m}
    return r


last_mon = monday_of(today - timedelta(days=7))
review = {
    "周起始": {"date": last_mon.isoformat() + "T00:00:00.000Z"},
    "保持": {"text": "早上通勤背单词效率最高"},
    "问题": {"text": "晚上刷手机，Python 两天没动"},
    "尝试": {"text": "Python 挪到午休"},
    "下周预案": {"text": "21 点没开始就把手机放客厅"},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不写线上")
    args = ap.parse_args()

    # ---- 步骤 1：清掉旧的示例目标及其打卡（幂等的关键） ----
    print("== 0/4 清理旧示例数据 ==")
    old = query(DB_GOALS, {"是否示例": {"$eq": True}}).get("results", [])
    old_ids = [g["record_id"] for g in old]
    old_names = [g.get("名称") or "?" for g in old]
    print(f"  旧示例目标 {len(old_ids)} 条: {old_names}")

    log_ids = []
    seen = set()
    for g in old:
        gid = g["record_id"]
        gname = g.get("名称")
        for flt in ({"目标ID": {"$eq": gid}}, {"目标名": {"$eq": gname}}):
            for lg in query(DB_LOGS, flt).get("results", []):
                if lg["record_id"] not in seen:
                    seen.add(lg["record_id"])
                    log_ids.append(lg["record_id"])
    print(f"  关联打卡 {len(log_ids)} 条")

    print("== 0.5/4 复盘按周起始复用（不新增重复） ==")
    existing_rv = query(DB_REVIEWS).get("results", [])
    rv_same = [r for r in existing_rv
               if str(r.get("周起始") or "").startswith(last_mon.isoformat())]
    print(f"  本周起始已有复盘 {len(rv_same)} 条（将更新而非新增）")

    if args.dry_run:
        print("\n[dry-run] 将删除: 目标 %d 条 / 打卡 %d 条" % (len(old_ids), len(log_ids)))
        print("[dry-run] 将写入: 目标 %d 条 / 打卡 %d 条 / 复盘 1 条" % (len(goals), len(log_spec)))
        return

    if old_ids:
        print(f"  → 删除 {batch_delete(DB_GOALS, old_ids)} 个旧示例目标")
    if log_ids:
        print(f"  → 删除 {batch_delete(DB_LOGS, log_ids)} 条旧打卡")

    # ---- 步骤 2：写目标并取回真实 record_id ----
    print("== 1/3 写入学习目标 ==")
    out = batch_add(DB_GOALS, goals)
    goal_ids = ids_of(out)
    print("  新建目标 record_id:", goal_ids)
    if len(goal_ids) != len(goals):
        print("  目标 id 数量不符，中止（避免记录关联错位）", file=sys.stderr)
        sys.exit(1)

    # ---- 步骤 3：写打卡，用真实 id 关联 ----
    print("== 2/3 写入打卡记录 ==")
    logs = [log_rec(gi, k, a, m, mk, goal_ids[gi]) for (gi, k, a, m, mk) in log_spec]
    out_logs = batch_add(DB_LOGS, logs)
    print("  新建记录条数:", len(ids_of(out_logs)), "/", len(logs))

    # ---- 步骤 4：复盘 —— 有则更新，无则新建 ----
    print("== 3/3 写入上周复盘 ==")
    if rv_same:
        upd = run_script("update_database_record.py", "--stdin", stdin_json={
            "database_id": DB_REVIEWS, "record_id": rv_same[0]["record_id"],
            "properties": review})
        print("  已更新复盘:", rv_same[0]["record_id"], "->", str(upd)[:80])
    else:
        out_rv = batch_add(DB_REVIEWS, [review])
        print("  新建复盘 record_id:", ids_of(out_rv))
    print("DONE（本脚本可重复执行，结果幂等）")


if __name__ == "__main__":
    main()

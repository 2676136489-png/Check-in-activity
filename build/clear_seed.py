# -*- coding: utf-8 -*-
"""清除线上三张表里的示例数据（是否示例=True 的目标 + 其打卡 + 全部复盘）。
   用于在重新 seed 前清空旧示例，避免重名。"""
import json
import subprocess
import sys

PY = r"C:/Users/111/.workbuddy/binaries/python/versions/3.13.12/python.exe"
LIB = r"C:/Users/111/AppData/Local/Programs/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library/database"
DB_GOALS = "BIidtdjTZqaX8pBamGfpwG"
DB_LOGS = "EWKqAtHl8V6s9UaAHpYd69"
DB_REVIEWS = "bMjplT6TsrTmhwH8BxZKIE"


def call(script, *args, stdin_json=None):
    cmd = [PY, f"{LIB}/{script}", *args]
    inp = json.dumps(stdin_json, ensure_ascii=False) if stdin_json is not None else None
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", input=inp)
    if r.returncode != 0:
        print(f"FAIL {script}: {r.stderr[-400:]}", file=sys.stderr)
        sys.exit(1)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"raw": r.stdout}


def query(db_id, flt=None):
    body = {"database_id": db_id}
    if flt:
        body["filter"] = flt
    return call("query_database_record.py", "--stdin", stdin_json=body)


def batch_delete(db_id, ids):
    if not ids:
        return
    body = {"database_id": db_id, "record_ids": ids}
    return call("batch_delete_database_records.py", "--stdin", stdin_json=body)


# 1. 查所有示例目标
print("== 查询示例目标 ==")
res = query(DB_GOALS, {"是否示例": {"$eq": True}})
goals = res.get("results", [])
goal_ids = [g["record_id"] for g in goals]
goal_names = [g.get("名称", {}).get("text", "") for g in goals]
print(f"  示例目标 {len(goal_ids)} 条: {goal_names}")

# 2. 查这些目标的打卡记录（按 目标ID 或 目标名）
print("== 查询示例目标的打卡记录 ==")
all_logs = []
for gid, gname in zip(goal_ids, goal_names):
    r1 = query(DB_LOGS, {"目标ID": {"$eq": gid}})
    all_logs.extend(r1.get("results", []))
    if gname:
        r2 = query(DB_LOGS, {"目标名": {"$eq": gname}})
        all_logs.extend(r2.get("results", []))
log_ids = []
seen = set()
for lg in all_logs:
    rid = lg["record_id"]
    if rid not in seen:
        seen.add(rid)
        log_ids.append(rid)
print(f"  关联打卡 {len(log_ids)} 条")

# 3. 查全部复盘
print("== 查询全部复盘 ==")
rv = query(DB_REVIEWS)
rv_ids = [r["record_id"] for r in rv.get("results", [])]
print(f"  复盘 {len(rv_ids)} 条")

# 4. 批量删除
if goal_ids:
    print(f"== 删除 {len(goal_ids)} 个示例目标 ==")
    batch_delete(DB_GOALS, goal_ids)
if log_ids:
    print(f"== 删除 {len(log_ids)} 条打卡 ==")
    batch_delete(DB_LOGS, log_ids)
if rv_ids:
    print(f"== 删除 {len(rv_ids)} 条复盘 ==")
    batch_delete(DB_REVIEWS, rv_ids)

print("DONE")

# -*- coding: utf-8 -*-
"""补写打卡记录的「目标ID」关联：按 (目标名, 日期) 配对目标 record_id，做定向更新。"""
import json
import subprocess
import sys
from datetime import date, timedelta

PY = r"C:/Users/111/.workbuddy/binaries/python/versions/3.13.12/python.exe"
LIB = r"C:/Users/111/AppData/Local/Programs/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library/database/"
DB_LOGS = "EWKqAtHl8V6s9UaAHpYd69"
DB_GOALS = "BIidtdjTZqaX8pBamGfpwG"

today = date.today()
n = lambda k: (today + timedelta(days=k)).isoformat()

goal_ids = ["oUvO5l0KamXH0Lj2TIbWvv", "C7Wdy0YBPos2aRilqYziEM", "dmXoOevBOR3m69yzv1CPs8"]
name2gid = {"背英语单词": goal_ids[0], "读《人类简史》": goal_ids[1], "Python 入门课": goal_ids[2]}


def sh(script, *args):
    r = subprocess.run([PY, LIB + script, *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("FAILED", script, r.stdout[-500:], r.stderr[-300:], file=sys.stderr)
        sys.exit(1)
    return r.stdout.strip()


out = sh("query_database_record.py", "--database-id", DB_LOGS)
raw = json.loads(out)
rows = (raw.get("data") or raw).get("results") or []
print("线上记录数:", len(rows))

need = [r for r in rows if not r.get("目标ID")]
print("缺目标ID的:", len(need))
payload = [{"record_id": r["record_id"],
            "properties": {"目标ID": {"text": name2gid[r.get("目标名")]}}} for r in need if r.get("目标名") in name2gid]
print("实际提交:", len(payload))
res = sh("batch_update_database_records.py", "--database-id", DB_LOGS,
         "--records", json.dumps(payload, ensure_ascii=False))
print("响应:", res[:400])

print("DONE")

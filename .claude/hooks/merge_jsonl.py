#!/usr/bin/env python
"""merge_jsonl.py — git custom merge driver for append-only JSONL (sonix_docs ML-312 S3 이식).

events/*.jsonl 은 append-only 이므로 두 브랜치의 라인 합집합(union) + 정확중복 제거
+ ts 정렬이 곧 올바른 머지다. union merge 의 "행 update 손상" 문제 없이 commutative.

설치:
  .gitattributes : events/*.jsonl merge=jsonl-append
  .git/config    : [merge "jsonl-append"]
                     name = JSONL append-only union+dedup merge
                     driver = python .claude/hooks/merge_jsonl.py %A %O %B
  (scripts/install-merge-drivers.sh 가 자동 등록)

git 호출: driver %A %O %B  →  %A(ours, 결과 기록 대상) %O(ancestor) %B(theirs)
성공(머지 완료) 시 exit 0. 결과를 %A 에 기록.
"""
import sys
import json


def _load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return [ln.rstrip("\n") for ln in f if ln.strip()]
    except OSError:
        return []


def _ts(line):
    try:
        return json.loads(line).get("ts", "")
    except (ValueError, TypeError):
        return ""


def main():
    if len(sys.argv) < 4:
        sys.stderr.write("usage: merge_jsonl.py %A %O %B\n")
        return 2
    ours, _ancestor, theirs = sys.argv[1], sys.argv[2], sys.argv[3]
    seen = set()
    merged = []
    for line in _load(ours) + _load(theirs):
        if line not in seen:
            seen.add(line)
            merged.append(line)
    merged.sort(key=_ts)  # ts 안정 정렬(같은 ts 는 입력순 보존)
    with open(ours, "w", encoding="utf-8", newline="\n") as f:
        for line in merged:
            f.write(line + "\n")
    return 0  # 항상 성공 — append-only union 은 충돌 불가


if __name__ == "__main__":
    sys.exit(main())

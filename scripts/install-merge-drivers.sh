#!/usr/bin/env bash
# register custom git merge drivers (per-clone, writes .git/config). (sonix_docs 이식)
# 각 clone/머신에서 1회 실행 필요. 두 드라이버를 등록한다:
#   (1) jsonl-append : events/*.jsonl 의 append-only union+dedup+ts정렬
#                      (미등록 시 .gitattributes merge=jsonl-append 가 union fallback
#                       → 안전하나 dedup 미작동)
#   (2) ours         : merge=ours 대상(.gitattributes — context-*.md 등)의
#                      "keep current(우리쪽)" 의사 드라이버. git 빌트인 ours 가 없어
#                      'true' 로 정의. 미등록 시 기본 3-way 텍스트 머지로 폴백 → 충돌 마커 가능.
#
# 사용: bash scripts/install-merge-drivers.sh
set -euo pipefail

git config merge.jsonl-append.name "JSONL append-only union+dedup merge"
# 상대경로 — 머지는 각 worktree 루트를 cwd 로 실행되므로 worktree-agnostic
git config merge.jsonl-append.driver 'python .claude/hooks/merge_jsonl.py %A %O %B'

# ours 의사 드라이버: 'true' 는 항상 exit 0 → git 이 %A(우리쪽) 를 그대로 유지.
git config merge.ours.name "Keep ours (local-only / derive-reconciled)"
git config merge.ours.driver true

echo "[OK] merge driver 'jsonl-append' registered (events/*.jsonl)"
echo "     driver = $(git config merge.jsonl-append.driver)"
echo "[OK] merge driver 'ours' registered (context-*.md 등)"
echo "     driver = $(git config merge.ours.driver)"

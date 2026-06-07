---
name: zm-setup
description: "팀원 머신/clone 1회 초기화 — 협업 인프라 활성화. git hooks(pre-push secret scan + WU 경합 가드) + merge driver(jsonl-append + ours) 설치/검증. Auto-loads for '셋업', 'setup', 'init', '머신 초기화', 'git hooks 설치', 'merge driver', '협업 환경' queries."
disable-model-invocation: false
allowed-tools: Bash
argument-hint: ""
---

# /zm-setup

새 머신/클론에서 **1회** 실행하여 zm-os 협업 인프라(sonix_docs 이식)를 활성화한다.
미실행 시에도 안전 fallback(union 머지)으로 동작하지만, **secret 스캔과 events dedup 이 미작동**한다.

> 언제: 레포 최초 clone 후 / 새 머신 / `.git/config` 초기화 후 / pre-push·merge 드라이버가 안 보일 때.
> 멱등(idempotent) — 여러 번 실행해도 안전.

## 실행

```bash
# 1) git hooks 설치 (pre-push: secret scan + WU 경합 가드)
python -X utf8 scripts/setup-git-hooks.py

# 2) events 머지 드라이버 등록 (events/*.jsonl union+dedup+ts정렬 + ours)
bash scripts/install-merge-drivers.sh
```

## 동작

| # | 스크립트 | 효과 |
|---|----------|------|
| 1 | `setup-git-hooks.py` | `scripts/git-hooks/*` → 실제 hooks 디렉토리 복사 + 실행권한. pre-push 에 secret scan + `check_wu_race.py` 포함 |
| 2 | `install-merge-drivers.sh` | `.git/config` 에 ① `merge.jsonl-append.driver`(events 동시 append union+dedup+ts정렬) ② `merge.ours.driver=true`(context-*.md 등 우리쪽 보존) |

## 검증 (실행 후 확인)

```bash
HK=$(git rev-parse --git-path hooks/pre-push); grep -c "check_wu_race" "$HK"   # >0 기대
git config merge.jsonl-append.driver                                            # 비어있지 않음
git config merge.ours.driver                                                    # 'true'
```

둘 다 통과면 `[OK] zm-setup 완료 — 협업 인프라 활성화` 출력.

## 미실행 시 영향 (안전하지만 기능 저하)

| 미설치 | 결과 |
|--------|------|
| git hooks | pre-push secret scan 미작동 |
| merge `jsonl-append` | events 머지가 union fallback → 안전하나 dedup 미작동 |
| merge `ours` | `merge=ours` 미해석 → 기본 3-way 머지 폴백 (context-*.md 는 LOCAL 이라 영향 경미) |

## 관련

- 온보딩: `/zm-onboarding`
- 스크립트: `scripts/setup-git-hooks.py`, `scripts/install-merge-drivers.sh`
- 헌법: `.claude/rules/constitution/02-ssot-and-derived.md`

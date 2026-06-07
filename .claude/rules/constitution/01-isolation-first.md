# 헌법 1 — Isolation-First (P1, P6)

> **상위 ADR**: [ADR-0030](../../../docs/02-decisions/adr-0030-isolation-first.md)
> **상태**: accepted (2026-06-07) — sonix_docs 협업 인프라 이식
> **Living Document**

## 원칙

**P1. 두 작업이 같은 파일을 동시에 만질 수 없도록 위치를 분리한다. lock이 아니라 설계가 충돌을 막는다.**

**P6. context-{user}.md, pre-compact-recovery 등 개인 메모리는 호스트별 local. 원격에 흘러나가지 않는다.**

## 근거

- 멀티 인스턴스/팀원 협업 시 같은 working tree 공유가 작업 분실의 주원인
- lock(heartbeat 5분 TTL)만으로는 race window 제거 불완전
- 위치 분리(git worktree)는 충돌 자체를 **구조적으로** 제거

## 실현 메커니즘

| 메커니즘 | 위치 |
|----------|------|
| WU 단위 worktree 진입 | `/zm-wu-start` 스킬 + `EnterWorktree(name="<wu>")` |
| `.worktreeinclude` LOCAL 자동 복사 | `.worktreeinclude` (repo root) |
| Local-Only 컨텍스트 | `.gitignore` `.project-memory/context-*.md` |
| 워크트리 회수 | `.claude/settings.json` `worktree.cleanupPeriodDays: 1` + `/zm-wu-stop` |

## 예외

- 단순 조회/검색(Edit/Write 없음)은 메인 worktree에서 허용
- 긴급 hotfix는 사용자 판단으로 메인에서 가능 — `WU_ENFORCE=0` 명시
- worktree 미지원 환경(git < 2.5) — zm-os 는 git 2.30+ 가정

## 검증

- 두 세션 동시 작업 → 작업 분실 0건
- 메인 worktree 의 활성 WU 영역 편집 → hook 경고/차단(`WU_ENFORCE=1` 시 BLOCK)
- `.gitignore` 와 실제 git tracking 일치(drift 0건)

## 관련 헌법

- [02-ssot-and-derived.md](02-ssot-and-derived.md)
- [03-domain-separation.md](03-domain-separation.md)

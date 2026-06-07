---
name: zm-onboarding
description: "신규 합류자 자동 등록 워크플로우. git 검증 → PREFIX 결정 → team-config 등록 → context-{prefix}.md 초기화 → /zm-setup 가이드. Auto-loads for '온보딩', 'onboard', '신입', '신규 팀원', '등록해줘', 'new member' queries."
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Glob
---

# /zm-onboarding

zm-os 레포에 **처음 합류한 사람**이 한 명령으로 자신을 시스템에 등록하고 협업 인프라를 활성화한다.
(sonix_docs `zm-onboarding` 이식 — zm-os 단일 레포라 서비스 경로/workspace 단계는 생략)

> **본인 등록 원칙**: 합류자 **본인 세션에서만** 실행. git config 변경/최종 commit 은 Claude 가 직접 하지 않고 사용자에게 명령 제시 (M-002 회피).
> **재실행 가능**: 이미 등록된 사용자 재호출 시 "갱신 모드" (context 만 재셋업).

## 4단계 워크플로우 (각 단계 완료 후 확인)

### Step 1: git config 검증
```bash
git config user.name && git config user.email
```
- 두 값 존재? 없으면 `git config --global user.name/user.email` 안내 후 중단
- user.name 이 `.claude/team-config.json` 어느 멤버 git_patterns 와 매칭되는지 확인
- 매칭됨 → "이미 등록됨, 갱신 모드" → Step 3(context)로 점프
- 매칭 안 됨 → 신규 등록 → Step 2

### Step 2: PREFIX 결정
`team-config.json` `defaults.prefix_rule` ("성+이름 3자리 대문자, 예: 이민수→LMS").
- 한글 이름 → 음절 초성 (윤성국 → YSG)
- 영문만 → 한국어 발음순/영문 표기순 2패턴 제시
- 충돌 검사:
  ```bash
  python -c "import json; print(list(json.load(open('.claude/team-config.json', encoding='utf-8'))['members']))"
  ```
- **AskUserQuestion** 으로 후보 2~3개 제시 + 직접입력 허용.

### Step 3: team-config.json 등록
확정 PREFIX 로 `members` 에 항목 추가 (Edit):
```json
"{PREFIX}": {
  "id": "M{NN}",
  "name": "{한글이름}",
  "ctx_suffix": "{prefix소문자}",
  "git_patterns": ["{git_user_name}", "{영문이름}", "{한글이름}"]
}
```
- `id`: 기존 최대 `M{NN}` +1
- **금지**: 기존 멤버 항목 수정/삭제, defaults 수정.

### Step 4: context-{prefix}.md 초기화
`.project-memory/context-{prefix}.md` 생성 (LOCAL-only, `.gitignore` 자동):
```markdown
# context-{prefix}.md — {PREFIX} ({이름}) 작업 컨텍스트
> 소유: {PREFIX}. 다른 사용자의 context-*.md 편집 금지.
> 저장소: LOCAL-only, host-bound. 갱신: Auto Memory + /zm-memory-save.

## 마지막 업데이트
{YYYY-MM-DD} — 신규 등록 완료
## 현재 포커스
- 환경 셋업 중
## 최근 결정사항
- {YYYY-MM-DD}: PREFIX = `{PREFIX}` 확정
## 다음 TODO
- [ ] `/zm-setup` 실행 (협업 인프라 활성화)
- [ ] 첫 작업 `/zm-work-intake` 또는 `/zm-wu-start <WU>`
## 차단 사항
- (없음)
```

## 등록 완료 리포트 + 다음 단계

```markdown
## 온보딩 완료
| 항목 | 위치 | git tracked? |
|------|------|--------------|
| 멤버 등록 | .claude/team-config.json members.{PREFIX} | ✅ |
| 개인 컨텍스트 | .project-memory/context-{prefix}.md | ❌ LOCAL |

### 다음 단계
1. 명시 파일만 커밋 (`git add .` [BLOCK M-002]):
   `git add .claude/team-config.json && git commit -m "chore: {PREFIX}({이름}) 팀 등록"`
2. **협업 인프라 셋업 (필수, 1회)** — `/zm-setup` (git hooks + merge driver)
3. 첫 작업: `/zm-work-intake` (신규) 또는 `/zm-wu-start <WU>` (기존 ID)
4. 필독: `CLAUDE.md` · `.claude/rules/constitution/` (헌법 P1~P7) · `.claude/rules/wu-claim.md`
```

## 자체 검사 (사후)
1. team-config.json 유효 JSON? 2. context-{prefix}.md 존재 + gitignore 매칭? 3. PREFIX 중복 없음? 4. id 시퀀스 일관?
전부 PASS면 `✓ Self-review PASS`.

## 기존 스킬 경계
- `zm-team`: 팀원 **조회**만 (등록은 본 스킬). `zm-setup`: 인프라 설치 (본 스킬 **다음** 단계).

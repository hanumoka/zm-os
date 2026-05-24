# zm-os

브라우저 안에서 동작하는 **가상 데스크탑 + 공유 앱 스토어** POC.
사용자가 만든 JavaScript 앱(특히 게임)을 스토어에 올려 공유 · 설치 · 실행한다.

> **상태**: Phase 0 — 초기 셋팅 (2026-05-24)
> **궁극 비전**: 사용자 OS · 멀티유저 · 공유 마켓플레이스 (몽상 1~4)
> **POC 1차**: JS 게임 스토어 + 단일 사용자 (몽상 5)

---

## Quick Start

```bash
# 의존성 설치
npm install

# 개발 서버 (http://localhost:3000)
npm run dev

# 타입 체크
npm run type-check

# 프로덕션 빌드 (POC에서는 미사용)
npm run build
```

---

## 기술 스택

- **풀스택**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- **언어**: TypeScript strict
- **클라이언트 스토리지**: IndexedDB + OPFS
- **앱 샌드박싱**: blob: URL iframe + `sandbox="allow-scripts"` + Comlink IPC
- **앱 패키지**: itch.io식 ZIP (`index.html` + 에셋 + Zod 매니페스트)

---

## 디렉토리 구조

```
zm-os/
├── src/                  # Next.js App Router (풀스택)
│   ├── app/              # 페이지 + route handlers (BE 대용)
│   ├── components/       # desktop / store / ui
│   ├── lib/              # apps (샌드박싱/IPC) / api / storage
│   └── types/
├── public/               # 정적 자산
├── zm-claude-docs/       # 모든 문서 (PRD/roadmap/ADR/features/research)
├── .claude/              # Claude Code 셋팅 (agents/skills/rules/hooks/memory)
├── CLAUDE.md             # Claude Code 지침
└── README.md             # 이 파일
```

---

## 문서

- **PRD**: [`zm-claude-docs/project/prd.md`](zm-claude-docs/project/prd.md)
- **로드맵**: [`zm-claude-docs/project/roadmap.md`](zm-claude-docs/project/roadmap.md)
- **Feature Map**: [`zm-claude-docs/project/feature-map.md`](zm-claude-docs/project/feature-map.md)
- **ADR 인덱스**: [`zm-claude-docs/decisions/index.md`](zm-claude-docs/decisions/index.md)
- **외부 리서치**: [`zm-claude-docs/research/`](zm-claude-docs/research/) — 브라우저 OS 비교 / 샌드박싱 기법 / 멀티테넌트 백엔드 옵션
- **Claude Code 지침**: [`CLAUDE.md`](CLAUDE.md)

---

## POC 1차 데모 시나리오 (목표)

1. 사용자가 데스크탑 화면을 본다.
2. "스토어"에서 게임 1개를 선택한다.
3. 설치 → 데스크탑에 아이콘 생성.
4. 아이콘 클릭 → 윈도우가 열리고 게임 실행 (iframe sandbox 안에서).
5. 종료 → 다시 실행 가능.

---

## 보안 (도메인 핵심)

사용자 제출 앱은 **반드시 blob: URL iframe + `sandbox="allow-scripts"`** 안에서만 실행. host와 origin 격리.
호스트-앱 통신은 **Comlink** RPC만 사용.

상세: [`.claude/rules/security.md`](.claude/rules/security.md) | [`zm-claude-docs/research/sandboxing-untrusted-js.md`](zm-claude-docs/research/sandboxing-untrusted-js.md)

---

## 라이선스

(미정 — POC 단계)

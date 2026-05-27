# 정책 다이제스트 (Policy Digest)
> 세션 시작 시 자동 로드. 상세: `docs/03-policy/01-policy-registry.md`
> 최종 갱신: 2026-05-27

## Active 정책

| ID | 정책 요약 | 날짜 |
|----|-----------|------|
| ARCH-01 | Next.js 풀스택 + v2 모노레포 (apps/web + packages/{core,storage,ipc,adapters-local}) | 2026-05-24 / reshape 2026-05-27 |
| ARCH-02 | blob: iframe + sandbox="allow-scripts" + Comlink IPC | 2026-05-24 |
| ARCH-03 | Ports & Adapters — 5 Port (Auth/AppRepo/Blob/Sync/Moderation) + 로컬-우선 + 클라우드 옵션 | 2026-05-27 |
| TECH-01 | BlobStorage Port + Local 어댑터 (IDB/OPFS/Memory) — 기존 StorageAdapter 격하 | 2026-05-24 / reshape 2026-05-27 |
| TECH-02 | Python hooks (bash sub-spawn 회피) | 2026-05-24 |
| TECH-03 | 정적 CSP/Permissions-Policy 헤더 (nonce 미도입) | 2026-05-24 |
| TECH-04 | react-rnd v10.5.3 (드래그+리사이즈+z-index) | 2026-05-24 |
| TECH-05 | React Context + useReducer (Zustand 미도입) | 2026-05-24 |
| TECH-06 | Tailwind v4 class 기반 dark variant (ADR-0012) | 2026-05-25 |
| TECH-10 | v2 모노레포 도구 — pnpm 11 + Turborepo 2.7 (ADR-0016) | 2026-05-26 |
| PROD-01 | POC = 게임 스토어 + 단일 사용자 데스크탑 | 2026-05-24 |
| PROD-02 | 카탈로그 하드코딩 desktopApps.ts | 2026-05-24 |
| PROD-03 | DesktopAppEntry 단일 확장 (description, category, screenshots) | 2026-05-24 |
| PROD-04 | 설치 상태 메모리 Context → IndexedDB reshape 완료 | 2026-05-24 |
| PROD-05 | JSZip + 단일 HTML inline + 보안 검증 6단계 | 2026-05-24 |
| CONST-01 | v2 RLS 의무 — CloudRepo 어댑터 한정 (LocalRepo는 단일 사용자 모델) | 2026-05-26 / scope 2026-05-27 |
| CONST-02 | 클라이언트 시계 hint, 서버 시계 권위 — CloudSync 어댑터 한정 | 2026-05-26 / scope 2026-05-27 |

## Superseded (참고용 보존)

| ID | 이전 결정 | superseded by |
|----|----------|---------------|
| TECH-07 | v2 Supabase Auth 단일 채택 (ADR-0013) | ADR-0017 → ADR-0024+ (CloudAuth-Supabase 예정) |
| TECH-08 | v2 Supabase Postgres + Drizzle (ADR-0014) | ADR-0017 → ADR-0025+ (CloudRepo-Supabase 예정) |
| TECH-09 | v2 LWW + 서버 권위 시계 (ADR-0015) | ADR-0017 → ADR-0026+ (CloudSync-LWW 예정) |

## 금지 사항 (도메인 핵심)
- iframe `allow-same-origin` **절대 금지**
- raw `postMessage` 금지 (Comlink 어댑터 경유)
- raw fetch 금지 (`apps/web/src/lib/api/` 경유 — POC 미구현, v2 도입 예정)
- `any` 타입 금지 (TypeScript strict)
- Port 인터페이스(`@zm/core/ports`)가 `@zm/storage`/`@zm/ipc` 등 어댑터 패키지 import 금지 (DIP)
- Local-only 빌드에 Cloud 어댑터 정적 번들 포함 금지 (로컬-우선)

## 진행 중 (2026-05-27)
- **ADR-0017~0023 채택 ✅ 일괄** — Ports & Adapters + 5 Port + Local 어댑터 6건 (LocalAuth/LocalRepo/LocalOPFS/LocalNoOpSync/LocalStaticModeration/Resolver)
- **다음**: v2 plan v0.3.0 재작성 → REFAC-02 (5 작업 분할: packages/adapters-local 신규 + 5 Provider Port 호출 reshape) → M5 진입 (SRV-01~02 + USR-01~04 로컬 인증 기본)

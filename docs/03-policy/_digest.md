# 정책 다이제스트 (Policy Digest)
> 세션 시작 시 자동 로드. 상세: `docs/03-policy/01-policy-registry.md`
> 최종 갱신: 2026-05-27

| ID | 정책 요약 | 날짜 |
|----|-----------|------|
| ARCH-01 | Next.js 풀스택 + v2 pnpm 11/Turborepo 2.7 모노레포 (apps/web + packages/{core,storage,ipc}) | 2026-05-24 / reshape 2026-05-26 |
| ARCH-02 | blob: iframe + sandbox="allow-scripts" + Comlink IPC | 2026-05-24 |
| TECH-01 | IndexedDB (idb v8.0.3) + 메모리 폴백 + OPFS | 2026-05-24 |
| TECH-02 | Python hooks (bash sub-spawn 회피) | 2026-05-24 |
| TECH-03 | 정적 CSP/Permissions-Policy 헤더 (nonce 미도입) | 2026-05-24 |
| TECH-04 | react-rnd v10.5.3 (드래그+리사이즈+z-index) | 2026-05-24 |
| TECH-05 | React Context + useReducer (Zustand 미도입) | 2026-05-24 |
| PROD-01 | POC = 게임 스토어 + 단일 사용자 데스크탑 | 2026-05-24 |
| PROD-02 | 카탈로그 하드코딩 desktopApps.ts | 2026-05-24 |
| PROD-03 | DesktopAppEntry 단일 확장 (description, category, screenshots) | 2026-05-24 |
| PROD-04 | 설치 상태 메모리 Context → IndexedDB reshape 완료 | 2026-05-24 |
| PROD-05 | JSZip + 단일 HTML inline + 보안 검증 6단계 | 2026-05-24 |
| TECH-06 | Tailwind v4 class 기반 dark variant (ADR-0012) | 2026-05-25 |
| TECH-07 | v2 사용자 인증 — Supabase Auth (⚠️ reshape 대기, AuthProvider 어댑터로 격하) | 2026-05-26 |
| TECH-08 | v2 DB 호스팅 — Supabase Postgres + Drizzle ORM (⚠️ reshape 대기, AppRepository 어댑터로 격하) | 2026-05-26 |
| TECH-09 | v2 동기화 — LWW + 서버 권위 시계 (⚠️ reshape 대기, CloudSync 어댑터 내 유지) | 2026-05-26 |
| TECH-10 | v2 모노레포 도구 — pnpm 11 + Turborepo 2.7 (ADR-0016) | 2026-05-26 |
| CONST-01 | v2 RLS 기본 활성화 의무 (auth.uid() = owner_id 패턴) | 2026-05-26 |
| CONST-02 | 클라이언트 시계 hint, 서버 시계 권위 (영구 정책) | 2026-05-26 |

## 금지 사항 (도메인 핵심)
- iframe `allow-same-origin` **절대 금지**
- raw `postMessage` 금지 (Comlink 어댑터 경유)
- raw fetch 금지 (`apps/web/src/lib/api/` 경유 — POC 미구현, v2 도입 예정)
- `any` 타입 금지 (TypeScript strict)

## 진행 중 방향 전환 (2026-05-26)
- **로컬-우선 아키텍처**: 외부 의존성 0 + 클라우드는 어댑터 옵션
- **Ports & Adapters (ADR-0017 대기)**: TECH-07/08/09는 어댑터 옵션으로 격하 예정

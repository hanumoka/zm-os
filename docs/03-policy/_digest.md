# 정책 다이제스트 (Policy Digest)
> 세션 시작 시 자동 로드. 상세: `docs/03-policy/01-policy-registry.md`
> 최종 갱신: 2026-05-25

| ID | 정책 요약 | 날짜 |
|----|-----------|------|
| ARCH-01 | 단일 Next.js 풀스택 (모노레포 v2) | 2026-05-24 |
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

## 금지 사항 (도메인 핵심)
- iframe `allow-same-origin` **절대 금지**
- raw `postMessage` 금지 (Comlink 어댑터 경유)
- raw fetch 금지 (`src/lib/api/` 경유)
- `any` 타입 금지 (TypeScript strict)

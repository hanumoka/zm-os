# Research: 멀티테넌트 웹 OS 백엔드 스택 후보

> Phase 1 리서치 (2026-05-24). v2 멀티유저 도입 시 사용.
> POC 1차에서는 채택 없음 (단일 사용자 + 클라이언트 스토리지만).

## 멀티테넌트 가상 파일시스템

### 클라이언트 계층
- **OPFS** (Origin Private File System): 최신, IndexedDB 대비 3-4배 빠름, Web Worker 동기 API, Safari 미지원
- **IndexedDB**: 호환성 최상, 2GB+, 폴백 필수
- **ZenFS** (구 BrowserFS): node FS API 에뮬, 여러 백엔드 마운트, 새 프로젝트엔 비권장

### 서버 동기화
- **S3 호환** (Cloudflare R2, MinIO, S3) + 사용자별 prefix
- 클라이언트 IndexedDB/OPFS는 로컬 캐시
- 충돌 해결: CRDT (Automerge, Yjs) 또는 last-write-wins

## 사용자 인증 + 멀티테넌시

| 옵션 | 장점 | 단점 |
|------|------|------|
| **Supabase Auth** | PostgreSQL RLS 통합 완벽, 무료 tier 충분 | 벤더 의존 |
| **Clerk** | Organizations 기능, JWT에 org_id 자동 | 유료 (확장 시) |
| **Auth.js** | 자체 호스팅, 통제권 | DevOps 부담 |
| **Keycloak** | 완전 통제 | 운영 복잡도 높음 |

### 데이터 격리 (2026 best practice)
- **Shared DB + Row-Level Security (RLS)** 가 표준
- 모든 테이블에 `tenant_id` 또는 `owner_id` + PG RLS 자동 필터링
- 스키마 분리/서브도메인 분리는 POC에 과함

### Clerk + Supabase 통합
- Clerk OrganizationSwitcher가 JWT에 `org_id` 자동 추가
- Supabase `auth.jwt()` 함수로 추출 → RLS 정책에 사용
- 구현 복잡도 매우 낮음

## 앱 스토어 백엔드

### 메타데이터 (Postgres)
```
apps(id, title, description, creator_id, bundle_url, downloads, rating, created_at, status)
```

### 번들 스토리지
- R2 또는 MinIO에 `/apps/{appId}/bundle.tar.gz`

### 자동 검사 (악용 방지)
- 사이즈 제한 5-10MB
- 정적 분석: eval() 금지, 의존성 화이트리스트
- 수동 모더레이션 (초기) → 신뢰 개발자 자동 승인
- VirusTotal API or hash 차단 DB (v3)

## 스택 시나리오 비교

| 시나리오 | 스택 | POC 소요 |
|---------|------|---------|
| **A — Supabase 올인** ⭐ | Next.js + Supabase + Clerk | 3-5일 |
| B — Self-hosted | Next.js + Postgres + MinIO + 자체 Auth | 7-10일 |
| C — Puter 포크 | 기존 UI 재활용 | 5-7일 (레거시 디버깅) |
| D — Cloudflare 풀스택 | Pages + Workers + R2 + D1 | 4-6일 |

### v2 권장: 시나리오 A
- Vercel 배포 무료, Supabase 100GB 무료, Clerk 무제한 사용자
- RLS 통합 완벽, 보안 코드 최소화
- GitHub template 풍부

## 운영 한계 (참고)

### 스토리지 비용
- 1만 사용자 × 5GB = 50TB → S3 약 $1,150/월
- R2는 egress 무료 → 대폭 절감
- 정책: 초기 무료 100MB, 추가는 프리미엄

### 악용 패턴
- 비트코인 마이너, 멀웨어 호스팅
- 대응: itch.io 사례 — 명확한 가이드라인 + 신고 메커니즘 + 개발자 검증

### 모더레이션 책임
- DMCA, 청소년 보호(DSA)
- itch.io / Glitch / Replit / CodeSandbox 사례 비교

## v2 권장 스택 (요약)

```
Frontend: Next.js + TypeScript + Tailwind
Auth: Clerk (Organizations)
Database: Supabase PostgreSQL + RLS
Storage: Cloudflare R2 (파일) + IndexedDB (클라이언트 캐시)
Sync: 간단한 polling (CRDT는 v3)
Deployment: Vercel
```

예상 v2 개발 기간: 2주 (풀타임)

## v2에서 의도적으로 미루는 것 → v3

- CRDT 실시간 협업
- 엔드-투-엔드 암호화
- VirusTotal 자동 검사
- SEO 최적화
- 모바일 네이티브
- 멀티리전 재해 복구

## 출처

- [OPFS - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [OPFS 성능](https://web.dev/articles/origin-private-file-system)
- [Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Clerk + Supabase 멀티테넌시](https://clerk.com/blog/multitenancy-clerk-supabase-b2b)
- [MinIO vs R2](https://startupik.com/minio-vs-cloudflare-r2-best-s3-compatible-storage/)
- [Cloudflare Workers Fullstack](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)
- [CRDTs](https://crdt.tech/)
- [itch.io 커뮤니티 규칙](https://itch.io/docs/general/community-rules)

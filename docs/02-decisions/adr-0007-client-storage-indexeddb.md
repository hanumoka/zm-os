---
number: "0007"
title: 클라이언트 스토리지 추상화 — IndexedDB (idb library) + 메모리 폴백
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001", "0006"]
---

# ADR-0007: 클라이언트 스토리지 추상화 (IndexedDB + 메모리 폴백)

## Context

TECH-01 정책에서 확정한 "IndexedDB + OPFS 클라이언트 스토리지" 로드맵을 따라 Phase 2 작업 2 (STG-01) 에서 IndexedDB 추상화 계층을 구현해야 한다.

**현재 상황**:
- PROD-04 (InstalledAppsProvider) 에서 메모리 Context로 설치 앱 목록을 관리 중 (Phase 2 작업 1, STR-01/02).
- APP-03 (IndexedDB 백엔드) 는 미구현 단계 — 설치한 앱 목록을 IndexedDB 에 persist 해야 함.
- Safari Private Browsing, Firefox private mode, 또는 quota=0 인 환경 지원 필수 (사용자 검증 FUTURE deferred).

**설계 질문**:
1. **의존성**: 자체 구현 vs idb library 도입?
2. **DB 스키마**: POC v1 단일 store (`installed-apps`) vs 다중 store 미리 설계?
3. **트랜잭션**: 메서드별 자동 트랜잭션 vs 호출자 책임?
4. **버전 관리**: 단일 v1 vs 세밀한 마이그레이션?
5. **폴백**: 메모리 (휘발) vs localStorage (~5MB) vs 에러?
6. **직렬화**: structured clone vs JSON?
7. **에러**: 표준 Error vs 커스텀?

## Decision

**선택: idb library v8.0.3 + 메모리 폴백 + 단일 DB/store + 메서드별 자동 트랜잭션**

### 1. **의존성: idb library v8.0.3**

- **이유**: Promise wrapper for IndexedDB (IDBOpenDBRequest → Promise).
- **기준**: npm idb 다운로드 수 ~1.2M/week, 유지보수 active (2025년 최신 버전), ISC 라이센스.
- **크기**: 번들 ~1.19KB (brotli 압축).
- **타입**: TypeScript DBSchema 제네릭으로 타입 안전 제공. `any` 회피 유도.
- **Safari 14 워라운드**: WebKit bug #226547 (IDB 트랜잭션 abort race) 내장 fix (Jake Archibald 기여, 2021).
- **기각한 안**: 자체 구현 (의존성 0이지만 Safari 14 워라운드 + DBSchema 타입 직접 구현 부담).

### 2. **DB 스키마: 단일 DB `zm-os` v1 + store `installed-apps`**

- **DB 이름**: `'zm-os'` (프로젝트명 일관성).
- **버전**: v1 (POC, 초기 버전).
- **store**: `STORE_INSTALLED_APPS = 'installed-apps'` (key-string, value-any).
- **이유**: POC 1차 범위는 설치 앱 목록뿐. 추후 store 추가 시 DB_VERSION bump (v1→v2).
- **기각한 안**:
  - A. 다중 store 미리 설계 (STORAGE, CACHE, METADATA 등) — POC 단순성 위반. 작업 3 (APP-03) 진입 후 필요하면 v2 마이그레이션.
  - B. 다중 DB (zm-os-main, zm-os-cache, ...) — 웹 스토리지 할당량 분산 없음. 단일 DB가 더 심플.

### 3. **트랜잭션: 메서드별 자동 트랜잭션**

- **구현**: idbGet/idbPut/idbDelete/idbList/idbClear 각 메서드가 자동으로 트랜잭션 관리.
- **이유**: 호출자 복잡도 경감. POC 단일 store라 원자성 요구 낮음. 다중 store 작업(v2)에서 복합 트랜잭션 필요하면 그때 고수준 API 추가.
- **Comlink 호환**: IPC 어댑터를 통해 호스트-앱 간 IDB 접근 시에도 자동 트랜잭션 유지 (v2 고려).
- **기각한 안**: 호출자가 db.transaction 직접 호출 — 복잡하고 오류 가능성 높음.

### 4. **버전 관리: 단일 v1 (upgrade 핸들러 미래 대비)**

- **현재**: DB_VERSION = 1, STORE_INSTALLED_APPS 생성.
- **upgrade(db, oldVersion)**:
  - `if (oldVersion < 1)` → STORE_INSTALLED_APPS 생성.
  - 추후 `if (oldVersion < 2)` → 새 store/index 추가 패턴으로 확장 가능.
- **기각한 안**: 버전 미리 설계 (v3까지) — 추측. 필요해진 시점에 최소 단위로 진행.

### 5. **폴백: 메모리 (page reload 시 휘발) + 호출자 인지 의무**

- **동작**: isIDBAvailable()=false (SSR, Safari Private Browsing 0 quota 등) 시 Map 기반 메모리 폴백.
- **제약**: 페이지 reload 시 휘발. `useEffect` 내 로직으로 localStorage 저장 등 별도 처리는 호출자 책임.
- **이유**:
  - localStorage (~5MB) 대신 메모리 → 용량 커서 설치 앱 저장 충분. quota exceeded 에러 회피.
  - "1회성 세션" 으로 인지 가능 (Safari Private Browsing 사용자 경험 합리화).
  - `useInstalledApps()` (작업 3) 에서 page load 시 카탈로그 다시 fetch 또는 localStorage fallback 추가 가능.
- **기각한 안**:
  - A. localStorage fallback — quota=5MB 제약. 큰 앱 이미지/매니페스트 저장 불가.
  - B. 에러 throw — 극단적. POC 검증 차단.

### 6. **직렬화: structured clone raw (호출자 Zod 검증)**

- **동작**: put(storeName, value) 시 JavaScript engine의 structured clone 알고리즘으로 deep copy 저장.
- **제약**: 호출자는 value 타입을 사전에 Zod 스키마로 검증. idb 라이브러리는 value의 타입 검증 미수행.
- **이유**: POC 범위 (설치 앱 객체 = JSON-serializable) 에서 structured clone 충분. WASM/Blob 등 복잡한 타입은 v2.
- **기각한 안**: JSON.stringify/parse wrapper — Zod 검증과 중복. structured clone이 더 permissive하고 성능 좋음.

### 7. **에러: 표준 Error throw**

- **동작**: openDB() 실패 → `Promise.reject(new Error('[zm-os IDB] ...'))`
- **에러 메시지**: 문제 식별 용이 (IDB unavailable vs quota exceeded vs db corrupted 등).
- **호출자**: try-catch로 처리하거나 fallback 선택.
- **기각한 안**: 커스텀 StorageError class — 불필요. POC 단순 Error로 충분.

## Consequences

### Positive
- **의존성 경량**: +1.19KB (brotli), MIT/ISC 라이센스, 유지보수 active.
- **Safari 호환성**: Safari 14 IDB race condition 워라운드 내장.
- **타입 안전**: idb DBSchema 제네릭 + 제네릭 idbGet<T>/idbPut<T> 함수로 호출자 타입 검증 유도.
- **트랜잭션 자동 관리**: race condition 회피. 호출자 실수 감소.
- **메모리 폴백**: Safari Private Browsing 등 quota=0 환경에서도 기본 동작 가능 (1회 세션).
- **POC 단순성**: 단일 store → 스키마 설계 부담 낮음. 작업 3 진입 후 필요시 확장.

### Negative
- **메모리 폴백 휘발성**: page reload 시 설치 앱 목록 소실. 호출자가 localStorage/sessionStorage 별도 처리 필수 (작업 3 APP-03 구현 시 명시).
- **외부 라이브러리 의존**: idb 업데이트/보안 패치 추적 필요.
- **버전 마이그레이션 부담**: 데이터 마이그레이션 (v1→v2) 필요 시 이력 관리 복잡성 증가 (v2 이상).
- **Quota exceed 처리 미흡**: quotaExceededError catch 없음 (호출자가 try-catch로 처리).

## Alternatives Considered

### A. 자체 구현 (Promises + IndexedDB API 직접 사용)
```ts
// 대략 200줄 코드
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('zm-os', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```
- **장점**: 의존성 0, 전체 제어.
- **단점**:
  - Safari 14 IDB abort race 핸들 직접 구현 필요 (복잡).
  - DBSchema TypeScript 제네릭 미제공 → `any` 남용 가능.
  - upgrade 핸들러의 blocked/blocking/terminated 이벤트 처리 누락 가능.
  - SSR (globalThis.indexedDB 가용성) 체크 반복 발생.
- **기각 사유**: POC 단순성 + 타입 안전성 모두 충족 불가. idb 라이브러리가 이 모든 것을 해결함.

### B. localStorage polyfill (5MB 한도 수용)
```ts
const storage = typeof indexedDB !== 'undefined'
  ? new IndexedDBAdapter()
  : new LocalStorageAdapter();
```
- **장점**: IDB 미사용 환경에서도 persist (폴백 자동).
- **단점**:
  - 5MB 한도 → 설치 앱 메타데이터 + 스크린샷 저장 불가.
  - 동기 API → 대용량 직렬화 시 UI 블로킹.
  - 구현 복잡 (IDB vs localStorage 두 가지 adapter).
- **기각 사유**: 용량 제약. POC 범위 (설치 앱 목록) 는 메모리도 충분.

### C. Repository pattern (도메인 모델과 스토리지 분리)
```ts
interface AppRepository {
  getInstalledApps(): Promise<App[]>;
  saveApp(app: App): Promise<void>;
}
class IndexedDBAppRepository implements AppRepository { ... }
class MemoryAppRepository implements AppRepository { ... }
```
- **장점**: 도메인 코드와 스토리지 독립. 테스트 용이.
- **단점**:
  - POC 범위에서 과설계 (YAGNI 위반).
  - `useInstalledApps()` (작업 3) 와 중복 추상화.
  - 인터페이스 정의 + 2개 구현 = 3배 코드.
- **기각 사유**: POC 단순성 위반. 저수준 CRUD 추상화(현재)로 충분. 도메인 로직은 호출자(useInstalledApps)가 담당.

## References

### PRD / 정책
- PRD §3 STG-01 ("설치한 앱 목록을 IndexedDB 에 저장").
- TECH-01 ("IndexedDB + OPFS 클라이언트 스토리지").
- PROD-04 ("InstalledAppsProvider → 메모리 Context, 작업 3 IndexedDB reshape").

### 산출물
- `src/lib/storage/indexeddb.ts` (183 LOC):
  - `isIDBAvailable()`: SSR 안전 가용성 체크.
  - `openDB()`: lazy singleton, upgrade 핸들러 포함.
  - `idbGet<T>()`, `idbPut<T>()`, `idbDelete()`, `idbList<T>()`, `idbClear()`: 메서드별 자동 트랜잭션.
  - 메모리 폴백: `_memoryStore` Map (page reload 시 휘발).

### research-analyst 보고 (idb npm 팩트)
- npm idb v8.0.3 (2025-11-20): 다운로드 ~1.2M/week.
- ISC 라이센스 (permissive, MIT 유사).
- GitHub stars: 2.5K (활발한 커뮤니티).
- WebKit bug #226547 (IDB transaction abort race, Safari 14): Jake Archibald 기여로 idb v8.0.1+ 에서 회피 로직 추가.
- 번들 크기: 1.19KB (gzip), ~1.5KB (brotli).

### 작업 흐름
1. **Phase 2 작업 1** (2026-05-24, STR-01/02): InstalledAppsProvider = 메모리 Context.
2. **Phase 2 작업 2** (2026-05-24, STG-01): src/lib/storage/indexeddb.ts 구현 (본 결정).
3. **Phase 2 작업 3** (FUTURE, APP-03): useInstalledApps() hook — IndexedDB 백엔드 + 메모리 context 초기화 로직.

### 호출자 책임 (작업 3 진입 시 명시)
- **page load 시 hydration**: indexedDB.idbList() 결과로 InstalledAppsProvider 초기값 설정.
- **quota exceeded**: try-catch로 처리 → localStorage fallback 또는 사용자 알림.
- **메모리 폴백 휘발**: 사용자에게 "설치 목록이 임시 저장됨" 명시 (Safari Private Browsing UX).

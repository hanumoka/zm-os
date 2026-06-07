/**
 * @zm/adapters-local — 5 Port의 Local 어댑터 SSOT (ADR-0017 §D3)
 *
 * REFAC-02 단계별 구현:
 * - P1 (현재): 빈 골조 — package.json + tsconfig.json + src/index.ts
 * - P2: blob-storage/ (packages/storage 흡수, ADR-0020)
 * - P3: app-repository/ (LocalRepo IDB, ADR-0019)
 * - P4: auth/ + sync/ + moderation/ (ADR-0018/0021/0022)
 * - P5: resolver.ts (Adapter Resolver, ADR-0023)
 *
 * 외부 의존성: @zm/core (workspace) + idb — DIP 준수 (ADR-0017 §D3)
 * 호출 패키지: apps/web (Composition Root) — 단방향 import
 */

// P2 (ADR-0020): BlobStorage Local 어댑터. 서브패스 '@zm/adapters-local/blob-storage' 권장.
export * from './blob-storage';

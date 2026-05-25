# Feature: App Manifest (APP-01, APP-02, APP-03)

**Status**: 계획 (Phase 1)
**Owner**: TBD
**Related PRD**: §3 APP-01, APP-02, APP-03

## 개요

앱이 자신을 zm-os에 어떻게 소개하는지 정의하는 매니페스트 + 패키지 포맷.

## 매니페스트 스키마 초안 (Zod로 검증)

```ts
{
  schemaVersion: 1,
  id: "com.example.snake",            // 역방향 도메인 권장
  name: "Snake",
  version: "1.0.0",
  author: "alice",
  description: "고전 스네이크 게임",
  entryPoint: "index.html",            // ZIP 내부 경로
  icon: "icon.png",
  size: { defaultWidth: 800, defaultHeight: 600 },
  permissions: ["gamepad", "audio"],    // 추후 확장
  sandbox: {
    storage: "isolated",                // host storage 접근 불가
    network: "none",                    // fetch 허용 안 함 (v1 정책)
    clipboard: false
  }
}
```

(상세는 Phase 1 작업 단위에서 확정. ADR-0002 후보)

## 패키지 포맷

POC 1차는 **itch.io 식 ZIP**:
- 루트 `index.html` + 모든 에셋
- `manifest.json` (위 스키마)
- 최대 사이즈 제한 (POC: 5MB)

## 의존성

- Zod (스키마 검증)
- ZIP 압축/해제 (jszip 또는 fflate)

## 미결정

- 매니페스트 schemaVersion vs manifest_version (Chrome Extension 컨벤션과 비교)
- 권한 모델 세분화 (Phase 2 또는 v2)
- 매니페스트 hash 검증 (변조 방지) — v2 클라우드 단계에서

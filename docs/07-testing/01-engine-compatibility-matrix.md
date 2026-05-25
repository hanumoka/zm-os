# 게임 엔진 호환성 매트릭스

> Phase 3-B 산출물. sandbox iframe (allow-scripts, null origin) 환경에서 게임 엔진 동작 검증.
> 최종 갱신: 2026-05-25

## 호환성 매트릭스

| 엔진 | 버전 | 렌더링 | sandbox | WebGL | 격리 | 비고 |
|------|------|--------|---------|-------|------|------|
| **Phaser 3** | 3.90.0 | 2D | PASS | PASS | PASS | Phase 2 GAME-01에서 검증 완료 |
| **Pixi.js 8** | 8.18.1 | 2D | PASS | PASS | PASS | 파티클 렌더링 + 인터랙션 정상 |
| **Three.js** | r184 (0.184.0) | 3D | PASS | PASS | PASS | WebGL 3D 렌더링 + 마우스 추종 정상 |
| **Godot.js** | — | 2D/3D | 미검증 | — | — | WASM + SharedArrayBuffer 의존, COEP/COOP 미도입으로 v2 후보 |

## 검증 항목

| 항목 | 설명 | 기준 |
|------|------|------|
| **sandbox** | `sandbox="allow-scripts"` 속성으로 동작하는가 | iframe sandbox 속성 확인 |
| **WebGL** | WebGL 컨텍스트 생성 + canvas 렌더링 | canvas 요소 존재 + 시각적 렌더링 |
| **격리** | 호스트 origin 스토리지/DOM 접근 차단 | `window.parent.localStorage` / `window.top.document.cookie` 접근 시 예외 |

## 샘플 앱

### Pixi.js — Particle Rain
- **파일**: `public/sample-game-pixi/index.html` + `public/pixi.min.js` (796KB)
- **기능**: 200개 파티클 낙하 + 클릭 폭발 인터랙션
- **라이브러리 크기**: 796KB (min, raw)

### Three.js — Spinning Cubes
- **파일**: `public/sample-game-three/index.html` + `public/three.min.js` (2MB, CJS→IIFE 래퍼)
- **기능**: 12개 3D 큐브 공전 + 와이어프레임 구 + 마우스 카메라 추종 + FPS 카운터
- **라이브러리 크기**: 2MB (IIFE 래퍼 포함)

## 제약 사항

### sandbox iframe 환경 제약
- 외부 CDN `<script src="https://...">` 불가 → 로컬 파일 필수
- ES module `import` 불가 (srcdoc null origin) → IIFE/UMD 글로벌 스크립트 필요
- `allow-same-origin` 금지 → 호스트 스토리지 접근 차단 (설계 의도)

### Three.js 특이사항
- Three.js r170+는 UMD 빌드 미제공 → CJS를 IIFE 래퍼로 감싸 `window.THREE` 노출
- 라이브러리 크기 2MB (raw) → gzip ~500KB 예상

### Godot.js 미지원 사유
- Godot HTML5 export는 SharedArrayBuffer 필요
- SharedArrayBuffer 활성화에는 `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` 헤더 필수
- 현재 TECH-03 정책: 정적 CSP 헤더, COEP/COOP 미도입
- sandbox iframe과 COEP의 상호작용 검토 필요 → v2에서 게임별 조건부 헤더 적용 검토

## e2e 자동화

- **스크립트**: `e2e-engine-compat.mjs`
- **실행**: `node e2e-engine-compat.mjs` (dev 서버 실행 필요)
- **산출물**: `e2e-out/engine-compat-*.png` (스크린샷) + `e2e-out/engine-compat-result.json`

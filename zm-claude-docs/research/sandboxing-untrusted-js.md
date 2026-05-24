# Research: 신뢰할 수 없는 JS 코드 브라우저 샌드박싱

> Phase 1 리서치 (2026-05-24). zm-os 앱 샌드박싱 기법 결정용.
> 이 문서는 외부 자료 정리본 (스냅샷). 신규 CVE는 정기 확인 필요.

## 후보 비교

### 1. iframe + `sandbox` 속성 ⭐⭐⭐ (선택)
- **모델**: 브라우저 기본 격리. `sandbox="allow-scripts"` 시 스크립트만 허용, 부모/localStorage/쿠키 격리.
- **성능**: 최소 오버헤드 (네이티브)
- **API 격리**: Permissions Policy + CSP 조합 가능
- **통신**: postMessage (Comlink 권장)
- **CVE 사례**: CVE-2024-5691 (Firefox), CVE-2025-54143 (Firefox iOS), CVE-2025-4609 (Chromium IPC)
- **우회 패턴**: `allow-same-origin + allow-scripts` 조합 절대 금지

### 2. ShadowRealm (TC39 Stage 2.7)
- 동기 격리 JS 전역 — 플러그인 방어용 표준 진행 중
- 2026-05 현재 브라우저 미지원

### 3. QuickJS in WASM (quickjs-emscripten)
- JS-in-JS 인터프리터. 강력한 WASM 경계.
- **장점**: 가상 FS + fetch 제어
- **단점**: 게임 성능 부적합 (CPU/메모리 오버헤드)

### 4. Figma Plugin Model (참고)
- VM 기반 격리 + null-origin iframe
- 초기 Realms 시도 실패 → VM 복귀
- 교훈: "프록시 기반 격리는 위험, 기본적으로 느림"

### 5. Cloudflare V8 Isolates
- 서버 측 비교. 프로세스 수준 격리.

### 6. CSP + Permissions-Policy
- CSP: 리소스 로딩만 제어. 이미 로드된 JS 실행은 제어 불가
- Permissions Policy: 브라우저 API 차단

## 권한 모델

### 파일시스템
- 실제 FS 불가 → IndexedDB / OPFS / WASM 가상 FS
- itch.io 패턴: ZIP (index.html + 에셋)

### 네트워크
- iframe: Permissions Policy로 제한 불가 (fetch는 JS 기능)
- 대안: postMessage로 호스트 프록시 경유

### Storage
- same-origin policy 자동 적용 (iframe origin이 다르면 자동 격리)
- localStorage 5MB 쿼터 — 호스트가 모니터링/청소

### 호스트-앱 통신
- `event.origin` 검증 필수 (와일드카드 금지)
- **Comlink (Google Chrome Labs)**: 1.1kB, postMessage RPC 추상화

## 앱 패키지 포맷 사례

### PWA Manifest
필수: `name`, `short_name`, `start_url`, `display`, `icons`

### itch.io HTML5 (운영 중)
- ZIP: `index.html` 루트 + 에셋
- 매니페스트 불필요

### zm-os 권장 매니페스트
```json
{
  "schemaVersion": 1,
  "id": "com.example.snake",
  "name": "Snake",
  "version": "1.0.0",
  "entryPoint": "index.html",
  "permissions": ["gamepad", "audio"],
  "sandbox": { "storage": "isolated", "network": "none", "clipboard": false }
}
```

## JS 게임 엔진 호환성

| 엔진 | iframe sandbox 호환 | 비고 |
|------|-------------------|------|
| Phaser 3/4 | ✅ | WebGL + Canvas. Phaser 4 신규 렌더러 (2026-04) |
| Pixi.js | ✅ | |
| Three.js | ✅ | |
| Godot HTML5 export | ⚠️ | WebGL2 + WASM. COEP/COOP 요구 가능성 |
| Unity WebGL | ⚠️ | SharedArrayBuffer 요구 |

## 보안 한계

### iframe sandbox 우회
- 최신 CVE 연쇄 (2024~2025): 클릭재킹, IPC, 다운로드 권한 우회
- 실무: `allow-same-origin + allow-scripts` 절대 금지

### 리소스 고갈
- 무한 루프: 브라우저 강제 중단 불가
- 대응: 글로벌 timeout (60초) + iframe별 모니터

### Realms 우회 사례
- realms-shim v1.2.0: 프로토타입 오염(CVE-2021-23543) 등
- Figma가 Realms 포기 이유

## zm-os 결정 (ADR-0001 참조)

**채택: blob: URL iframe + `sandbox="allow-scripts"` + Comlink RPC**

이유:
1. 브라우저 네이티브 격리 (성능, 신뢰성)
2. Figma/itch.io 등 검증된 패턴
3. 게임 엔진 100% 호환
4. 구현 단순 (Comlink로 추상화)

한계와 대응:
- iframe CVE 추적: `.claude/rules/security.md` CVE 목록 갱신
- 카메라/마이크 등 API: 별도 permission grant flow (v2)
- 무한 루프: iframe별 soft timeout
- COEP/COOP 게임 충돌: 헤더 조건부 적용

## 출처

- [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- [CVE-2024-5691 Firefox](https://bugzilla.mozilla.org/show_bug.cgi?id=1888695)
- [CVE-2025-4609 Chromium](https://www.ox.security/blog/the-aftermath-of-cve-2025-4609-critical-sandbox-escape-leaves-1-5m-developers-vulnerable)
- [Figma Plugin System](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- [Figma Security Update](https://madebyevan.com/figma/an-update-on-plugin-security/)
- [TC39 ShadowRealm](https://github.com/tc39/proposal-shadowrealm)
- [QuickJS WASM Sandbox](https://dev.to/sebastian_wessel/execute-javascript-in-a-webassembly-quickjs-sandbox-14nn)
- [itch.io HTML5](https://itch.io/docs/creators/html5)
- [Phaser](https://blog.logrocket.com/best-javascript-html5-game-engines-2025/)
- [Godot Web Export](https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_web.html)
- [COOP/COEP](https://web.dev/articles/coop-coep)
- [Comlink](https://github.com/GoogleChromeLabs/comlink)

# ADR-0047 — WebAssembly 게임과 일반 Store 배포 예제

상태: accepted. 대상: 플랫폼·앱 개발자와 검수자. 검토일: 2026-11-06.

소유자가 DOOM 계열 게임으로 개발자 등록·Store 공개·사용자 플레이가 실제 이어지는지 검증하도록 요청했다. 이 결정은 ADR-0042의 웹 번들 실행을 구체화하며 앱별 서버·DB 운영이나 개인정보 제공 범위를 바꾸지 않는다.

## 실행 경계

기존 번들 검사는 `.wasm`을 허용했지만 자산 서버의 CSP는 Wasm 컴파일을 허용하지 않았다. 플랫폼 자산 서버와 CLI 시험 호스트의 `script-src`에 `wasm-unsafe-eval`을 추가한다. JavaScript `unsafe-eval`은 추가하지 않는다. 호스트 페이지 CSP와 `sandbox="allow-scripts"`는 유지하며 `allow-same-origin`·pointer lock·팝업·다운로드·새 외부 접속 권한을 부여하지 않는다.

Wasm 실행 자체는 저장·사용자 식별 권한이 아니다. 실행 세션으로 제공한 앱의 계산 기능이며 기존 앱 권한·SDK·동의·중지 검사와 별개다. 엔진을 JS에 포함하고 게임 데이터를 메모리에서 풀어 추가 fetch를 피한다. `connect-src`에 자산 서버나 임의 출처를 새로 열지 않는다. ZIP 5 MiB / 해제 20 MiB / 파일 256개 제한을 유지한다.

## 재배포 가능한 게임

- `examples/freedoom`은 doomgeneric 고정 commit의 GPL-2.0-or-later 엔진과 Freedoom 0.13.0의 BSD 데이터를 사용한다. 상용 DOOM WAD·로고는 포함하지 않는다.
- C Canvas·키 입력 어댑터를 Emscripten의 고정 이미지로 컴파일한다. 단일 E1M1 레벨, 무음, 외부 서버 없음, 저장 권한 없음이다. 게임 내 저장은 메모리 파일에만 남으며 창을 닫으면 사라진다.
- 큰 원본 WAD에서 미사용 지도·벽 그래픽·효과음을 제거한다. 엔진 초기화에 필요한 음악 리소스는 남기지만 재생하지 않는다. 메뉴·출구의 레벨 전이를 E1M1로 제한하고 변경 사항을 고지한다.
- 생성물을 저장소에 포함하여 일반 앱 빌드·CI가 Docker로 엔진을 다시 컴파일할 필요는 없게 한다. 원본 SHA-256과 도구 digest, 컴파일 명령, 변경한 코드는 함께 보관한다.
- 앱 번들 안에 엔진의 대응 C/헤더 소스, 어댑터, UI 원본, 빌드 스크립트, GPL·Freedoom 고지 및 도구 런타임 고지를 넣는다. 이용자는 앱 안에서 파일별 전문을 읽고 복사할 수 있다.

## 배포와 확인

1. 일반 개발자가 신청하고 별도 운영자가 승인한다.
2. 개발자가 앱 ID를 발급받고 표준 CLI로 만든 ZIP을 제출한다.
3. worker의 검증이 통과하면 개발자가 검수를 요청한다. 운영자는 제출 판과 라이선스·권한·실행을 확인하고 사유를 남긴다.
4. 소유 개발자가 승인 판을 공개한다. 일반 사용자는 Store에서 안내에 동의하고 게임을 실행한다.
5. 독립 브라우저 시험은 실제 레벨 렌더링·이동·발사 후 탄약 변경·정지·복원·소스 조회를 확인한다. 별도 시험 자산으로 eval·Function·부모 DOM·외부 fetch 차단도 확인한다. DevTools 직접 평가로 CSP를 검증하지 않는다.

검증 결과는 [개발 기록](../11-archive/2026-11.md)에 측정 ref와 함께 기록한다. 이 예제의 통과가 모든 게임 엔진·대형 번들·오프라인 실행·Android·공개 서비스 운영을 검증한 뜻은 아니다. 임의 앱의 CPU·메모리 남용을 강제로 제한하는 장치는 별도 운영 과제다.

근거: [doomgeneric 원본](https://github.com/ozkl/doomgeneric/tree/e257a09527062bfb986b6e5e0780839b6cbd5b71), [Freedoom 배포판](https://github.com/freedoom/freedoom/releases/tag/v0.13.0), [Freedoom 고지](https://github.com/freedoom/freedoom/blob/v0.13.0/COPYING.adoc), [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

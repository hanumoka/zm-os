# zm-os Android 로컬 시험 호스트

대상: 구현 담당자. 소유자: 프로젝트 소유자. 검토일: 2026-11-01.

Expo SDK 55·React Native 0.83.10·WebView 13.16.0 조합이다. 설치된 Expo의 호환성 검사에 맞춰 React Native 패치 판을 선택한다. 웹 호스트 안의 격리 iframe을 재사용한다. 범용 `onMessage` 네이티브 브리지는 제공하지 않는다.

## 실행 전제와 절차

1. Android SDK API 36, 에뮬레이터 또는 USB 디버깅 기기, Java와 로컬 플랫폼 서버를 준비한다. 이 작업 당시 Android SDK·기기가 없어 실제 기기 시험은 수행하지 않았다.
2. 저장소 루트에서 `pnpm install` 후 API·worker·웹·자산 서버를 시작한다.
3. 기기에서 PC의 loopback 서버를 사용하도록 `adb reverse tcp:4300 tcp:4300`, `adb reverse tcp:4310 tcp:4310`, `adb reverse tcp:4311 tcp:4311`을 실행한다. 외부 예제 서버를 시험하면 그 포트도 연결한다.
4. `pnpm --filter @zm/android android`로 개발 빌드를 설치한다. `zmos://auth` 복귀 스킴을 확인하려면 Expo Go가 아닌 이 개발 빌드를 사용한다.
5. Store·내 앱·동의·앱 실행·사용자 전환·로컬 저장·일반/긴급 중지·동의 철회를 실제 기기에서 확인한다. 웹 빌드나 Metro 번들 성공만으로 이 검사를 완료했다고 표시하지 않는다.

`plugins/withLocalNetwork.cjs`는 이 시험 앱에 한해 `localhost`·`127.0.0.1`의 HTTP를 허용하고 그 밖의 HTTP는 기본 차단하는 Android network security XML을 생성한다. 호스트 기본 주소는 `http://localhost:4300`, 자산 기본 주소는 `http://localhost:4311`이다. 네트워크 origin은 API 설정과 같아야 한다. 앱의 자동 백업과 불필요한 위치·카메라·녹음·외부 저장·오버레이·진동 권한은 이 시험 구성에서 사용하지 않는다.

`expo prebuild --platform android --no-install`로 생성한 manifest와 XML에서 이 설정 및 `zmos` 스킴을 확인했다. 생성된 `android/`는 Git에 추적하지 않으며 `app.json`·config plugin·pnpm 패치로 재생성한다. 이는 Android 빌드·런타임 시험의 완료를 뜻하지 않는다. 근거는 [Expo config plugin](https://docs.expo.dev/config-plugins/plugins/)과 [Android network security configuration](https://developer.android.com/privacy-and-security/security-config)이다.

## 인증

Google·GitHub 로그인은 시스템 브라우저를 사용한다. 단회 코드·PKCE 확인 후 단회 POST 티켓으로 WebView의 HttpOnly 세션을 시작한다. 플랫폼 토큰을 URL이나 인앱에 전달하지 않는다. 실제 OAuth 제공자 설정과 복귀 시험은 별도다.

인증 시작점은 네이티브 툴바의 사용자 동작이다. 연결·재인증은 신뢰하는 최상위 웹 문서에 고정 스크립트를 주입하여 현재 세션·CSRF로 준비 요청을 보낸다. 서버가 단회 시작 티켓을 현재 계정에 결합한다. 네이티브가 생성한 nonce와 정확한 origin·경로·최상위 프레임이 일치하는 이동만 시스템 브라우저로 넘긴다. 프레임 메시지로 native 기능을 호출하는 API는 없다. 취소·시간 초과 후에는 해당 nonce를 폐기한다. 실제 기기에서는 다른 계정의 브라우저 쿠키·동시 시도·복귀 재사용까지 시험해야 한다.

## WebView 패치와 검증 경계

설치한 `react-native-webview@13.16.0`의 [Android 원문](https://github.com/react-native-webview/react-native-webview/blob/v13.16.0/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java)을 확인했다. `WebResourceRequest.isForMainFrame()`이 문자열 overload로 전달되는 과정에서 사라져, TypeScript 선언과 달리 Android 이벤트에 `isTopFrame`이 없다. 이를 허용으로 해석하면 최상위 탐색과 앱 iframe을 구분하지 못한다.

저장소의 pnpm 패치는 현대 Android 요청의 프레임 정보를 두 이벤트 경로에 전달한다. 프레임 정보가 없는 구형 callback은 누락 상태로 두며 호스트가 거부한다. 탐색 검사 응답 시간 초과·인터럽트도 허용하지 않고 차단한다. 정상적인 명시 허용 결과는 유지한다. 패치가 없으면 호스트는 프레임 정보가 누락된 탐색을 거부한다.

소스 diff와 JavaScript 번들 검사는 native Java 컴파일·WebView 실동작 검증을 대신하지 않는다. SDK 준비 후 프레임 플래그, 허용된 자산 iframe, 차단된 최상위 외부 탐색, 콜백 지연·인터럽트, 네이티브 인증 메뉴를 실제 Android에서 검증해야 한다.

`pnpm --filter @zm/android test`는 Node.js 24의 TypeScript 로딩으로 탐색 정책의 5개 거부·허용 시나리오를 검증한다. 프레임 정보 누락, 최상위 자산 탐색, iframe의 인증 시도, nonce·경로·시점 불일치가 대상이다. 이는 네이티브 이벤트가 실제로 그 필드를 전달하는지 확인하는 시험과 별개다. `pnpm --filter @zm/android type-check`, `pnpm --filter @zm/android bundle`, `pnpm --filter @zm/android exec expo install --check`로 타입·Hermes 번들·SDK 의존성 호환성을 확인한다.

## 실패 시 확인

- 연결 실패: 플랫폼 프로세스와 `adb reverse --list`를 확인한다.
- OAuth 복귀 실패: 개발 빌드의 스킴, 제공자 콜백, 단회 코드의 만료와 PKCE를 확인한다. 비밀 값은 로그에 남기지 않는다.
- iframe·저장 실패: 기기 WebView 판과 sandbox/CSP·MessagePort 지원을 확인한다. `allow-same-origin` 추가로 우회하지 않는다.
- 개발 빌드 종료 시 자신이 만든 `adb reverse --remove tcp:4300` 등 연결만 정리한다. 사용자 기기 데이터를 자동 초기화하지 않는다.

공식 근거: [Expo SDK 호환 표](https://docs.expo.dev/versions/v55.0.0/), [WebBrowser](https://docs.expo.dev/versions/v55.0.0/sdk/webbrowser/), [WebView](https://docs.expo.dev/versions/v55.0.0/sdk/webview/).

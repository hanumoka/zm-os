/**
 * 호스트 API 합성 루트 — 계약(타입)과 구현(핸들러)이 만나는 유일한 지점.
 *
 * `@zm/core`의 `HostApiSurface`가 **무엇을 부를 수 있는가**를 정하고, 이 파일이
 * **그것이 실제로 무엇을 하는가**를 정한다. 둘을 잇는 배선도 여기 하나뿐이다.
 *
 * 예전에는 이 자리가 없었다. 그래서
 * - 허용 메서드 목록이 `desktopApps.ts`와 `sandbox-test/page.tsx`에 **각각 하드코딩**됐고
 * - 핸들러 구현이 앱 카탈로그 데이터 안에 인라인됐으며
 * - `capabilitiesToAllowedMethods`와 `manifest.capabilities`는 **프로덕션 호출자가 0건**이었다
 *
 * 즉 capability 시스템 전체가 배선되지 않은 채 존재했다.
 *
 * @module lib/apps/host-api
 */

import {
  capabilitiesToAllowedMethods,
  isKnownCapability,
  type AvailableCapability,
  type ImplementedFlat,
} from '@zm/core';
import type { HostApi } from '@zm/ipc';

/**
 * 호스트 API가 부수 효과를 낼 때 쓰는 창구.
 *
 * 핸들러가 `WindowManager`를 직접 잡지 않는 이유는 두 가지다 — 창이 없는 진단 페이지에서도
 * 같은 API를 쓸 수 있어야 하고, 앱마다 대상 창이 다르므로 창 ID를 인자로 받는 순간
 * 앱이 남의 창을 지목할 수 있게 된다. **여기서 창을 이미 고정해 넘긴다.**
 */
export type HostApiContext = {
  /** 이 앱이 들어 있는 창의 제목을 바꾼다. */
  readonly setTitle: (title: string) => void;
  /** 이 앱이 들어 있는 창을 닫는다. */
  readonly close: () => void;
};

/**
 * 구현이 있는 capability의 핸들러 전부.
 *
 * 반환 타입이 `ImplementedFlat<AvailableCapability>`라 **키 누락·초과·시그니처 불일치가
 * 전부 컴파일 에러**다. 카탈로그에서 `status`를 `available`로 올리면 그 즉시 여기 핸들러를
 * 요구받고, 반대로 `planned`인 것을 구현해도 실패한다.
 *
 * `notes.*`가 여기 없는 것은 의도다 — 첫 실물 앱이 없어 읽고 쓸 노트 저장소가 없고,
 * `notes` namespace를 만들면 `DB_SCHEMA_VERSION`이 올라간다. 정책이 "namespace는 그것을
 * 읽고 쓰는 코드와 같은 릴리스에서만 추가한다"를 금지 조항으로 두고 있다.
 */
export function buildHostApi(ctx: HostApiContext): ImplementedFlat<AvailableCapability> {
  return {
    'shell.setTitle': (text: string): Promise<void> => {
      ctx.setTitle(text);
      return Promise.resolve();
    },
    'shell.close': (): Promise<void> => {
      ctx.close();
      return Promise.resolve();
    },

    // 데모 — 배선이 실제로 살아 있는지 브라우저에서 확인하는 카나리아다.
    'demo.ping': (): Promise<'pong'> => Promise.resolve('pong'),
    // epoch ms. ISO 문자열이 아니다 — 첫 앱이 복사할 예제이므로 계약 §1과 맞춘다.
    'demo.getTime': (): Promise<number> => Promise.resolve(Date.now()),
    'demo.echo': (text: string): Promise<string> => Promise.resolve(`host echoed: ${text}`),
  };
}

/** 앱이 부를 수 있는 것을 계산한 결과. `createHostEndpoint`에 그대로 넘어간다. */
export type ResolvedHostApi = {
  readonly allowedMethods: ReadonlyArray<string>;
  readonly expose: HostApi;
  /** 권한은 있으나 핸들러가 없는 메서드가 있는가. 있으면 `unimplemented`로 회신한다. */
  readonly hasPlanned: boolean;
  /** 매니페스트에 있었으나 카탈로그에 없는 토큰. 조용히 버리지 않고 호출자가 경고한다. */
  readonly unknownCapabilities: ReadonlyArray<string>;
};

/**
 * 매니페스트가 선언한 capability로부터 실제 호출 표면을 만든다.
 *
 * 여기가 `manifest.capabilities`의 **유일한 소비 지점**이고
 * `capabilitiesToAllowedMethods`의 **유일한 프로덕션 호출 지점**이다.
 */
export function resolveHostApi(
  capabilities: ReadonlyArray<string>,
  ctx: HostApiContext,
): ResolvedHostApi {
  const allowedMethods = capabilitiesToAllowedMethods(capabilities);
  const expose = buildHostApi(ctx) as unknown as HostApi;
  // 허용됐는데 핸들러가 없는 것 = 계약상 planned. 'denied'가 아니라 'unimplemented'다.
  const hasPlanned = allowedMethods.some((m) => !(m in expose));
  const unknownCapabilities = capabilities.filter((c) => !isKnownCapability(c));
  return { allowedMethods, expose, hasPlanned, unknownCapabilities };
}

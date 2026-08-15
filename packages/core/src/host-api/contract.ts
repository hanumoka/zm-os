/**
 * 호스트 API 계약 — 유일한 정본 (zm-docs `docs/projects/zm-os/contracts.md` §3)
 *
 * 앱이 호스트에게 부를 수 있는 것의 전부가 이 파일의 `HostApiSurface` 하나다.
 * capability 토큰·와이어 메서드 이름·구현 타입·매니페스트 enum이 전부 여기서 파생되므로
 * **서로 어긋난 값이 존재할 수가 없다.**
 *
 * 이 구조를 고른 이유는 계약의 조항들을 검사가 아니라 **표현 불가능**으로 만들기 위해서다.
 *
 * - 표면이 `네임스페이스 → capability → 메서드` 3단이라 메서드를 놓을 자리가 capability
 *   아래밖에 없다. "capability 없는 메서드"와 "남의 capability에 속한 메서드"를 적을 곳이 없다
 * - 메서드를 `Method<>`로만 쓸 수 있고 그것이 항상 `Promise`를 낸다. policies.md 1절의
 *   "동기 예외 하나가 격리 제거를 불가역으로 만든다"가 단언이 아니라 문법이 된다
 * - 인자·반환이 `JsonValue`로 제한된다. `Date`·`Map`·`Set`·`Blob`은 메서드를 가져
 *   인덱스 시그니처에 배정되지 않으므로 자동으로 거부된다(contracts.md §1)
 *
 * **앱에 세션·계정 식별자를 전달하는 메서드를 두지 않는다.** 경계 타입에 `ownerId`가
 * 없는 것이 그 조항의 실행이다.
 *
 * @module core/host-api/contract
 */

// ─── 경계 값 도메인 ───────────────────────────────────────────────────────────

/**
 * 경계를 넘을 수 있는 값 (contracts.md §1).
 *
 * ⚠ 경계 레코드는 `interface`가 아니라 `type`으로 쓴다. `interface`에는 암묵적
 *   인덱스 시그니처가 없어 여기에 배정되지 않고, 에러 메시지가 원인을 알려주지 않는다.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<JsonValue>
  | { readonly [k: string]: JsonValue };

/**
 * 경계 메서드 생성자. 표면의 모든 멤버는 이것을 통해야 한다.
 *
 * ⚠ optional 인자(`f(x?: string)`)를 쓰지 않는다. 원소 타입에 `undefined`가 섞여
 *   `JsonValue` 배정에 실패한다. 필요하면 `string | null`을 명시한다 — contracts.md §1의
 *   "`undefined` 필드를 저장하지 않는다"와 같은 이유다.
 */
export type Method<A extends ReadonlyArray<JsonValue>, R extends JsonValue | void> = (
  ...args: A
) => Promise<R>;

// ─── 경계 레코드 ──────────────────────────────────────────────────────────────

export type NoteId = string;

/**
 * 앱이 보는 노트. **`ownerId`가 없다.**
 *
 * 저장 레코드(`ownerId`를 가진 것)와 경계 레코드를 분리하는 이유는 두 가지다.
 *
 * 1. policies.md 1절 "앱에 세션·계정 식별자를 전달하지 않는다". `ownerId`는 로그인이
 *    붙으면 계정에 매핑되는 값이므로(contracts.md §2) 앱에 나가면 안 된다
 * 2. `put(doc)`이 앱에서 `ownerId`를 받으면, contracts.md §2가 "어댑터는 `ownerId`를
 *    인자로 받지 않고 컨텍스트에서 읽는다"로 이미 닫은 구멍을 IPC 계층에서 다시 연다
 *
 * 저장 레코드로의 변환은 어댑터 안에서만 일어난다.
 */
export type NoteDoc = {
  readonly id: NoteId;
  readonly title: string;
  /** JSONContent — 무손실 정본. **호스트는 내용을 해석하지 않는다.** */
  readonly doc: JsonValue;
  readonly outline: ReadonlyArray<{
    readonly level: number;
    readonly text: string;
    readonly id: string;
  }>;
  readonly plain: string;
  /** epoch ms. `Date`가 아니다 (contracts.md §1). */
  readonly updatedAt: number;
};

/**
 * 목록 항목. **`doc`을 싣지 않는다.**
 *
 * 부팅 한 번에 전 문서 본문이 IPC를 통과하는 것을 막는다. 앱→호스트 메시지는
 * 60건/1000ms에서 차단되고 본문은 크기 상한이 없다.
 */
export type NoteSummary = Pick<NoteDoc, 'id' | 'title' | 'updatedAt'>;

// ─── 표면 ─────────────────────────────────────────────────────────────────────

/**
 * 호스트 API의 전부. `네임스페이스 → capability 접미사 → 메서드`.
 *
 * 여기에 없는 것은 앱이 부를 수 없다.
 */
export interface HostApiSurface {
  notes: {
    read: {
      list: Method<[], ReadonlyArray<NoteSummary>>;
      get: Method<[id: NoteId], NoteDoc | null>;
    };
    write: {
      put: Method<[doc: NoteDoc], void>;
      delete: Method<[id: NoteId], void>;
    };
  };
  shell: {
    window: {
      setTitle: Method<[text: string], void>;
      close: Method<[], void>;
    };
  };
  demo: {
    basic: {
      ping: Method<[], 'pong'>;
      /** epoch ms. ISO 문자열이 아니다 — 첫 앱이 복사할 예제이므로 §1과 맞춘다. */
      getTime: Method<[], number>;
      echo: Method<[text: string], string>;
    };
  };
}

// ─── 파생 ─────────────────────────────────────────────────────────────────────

type Ns = Extract<keyof HostApiSurface, string>;
type Tag<N extends Ns> = Extract<keyof HostApiSurface[N], string>;
type Fn<N extends Ns, T extends Tag<N>> = Extract<keyof HostApiSurface[N][T], string>;

/** `'notes.read' | 'notes.write' | 'shell.window' | 'demo.basic'` */
export type CapabilityId = { [N in Ns]: `${N}.${Tag<N>}` }[Ns];

/**
 * 와이어의 `method` 값 도메인.
 *
 * 평면 문자열을 유지하고 값만 좁힌다 — 프로토콜 스키마를 바꾸지 않으므로
 * `IPC_PROTOCOL_VERSION` 인상이 없다. 최장 `shell.setTitle`(14자)이 기존 상한 64자 안이다.
 */
export type HostMethodName = {
  [N in Ns]: { [T in Tag<N>]: `${N}.${Fn<N, T>}` }[Tag<N>];
}[Ns];

/** capability 토큰이 여는 메서드들. 별도 join table이 필요 없다. */
export type MethodsOf<C extends CapabilityId> = C extends `${infer N extends Ns}.${infer T}`
  ? T extends Tag<N>
    ? `${N}.${Fn<N, T>}`
    : never
  : never;

type Lookup<N extends Ns, M extends string> = {
  [T in Tag<N>]: M extends Fn<N, T>
    ? HostApiSurface[N][T][M & keyof HostApiSurface[N][T]]
    : never;
}[Tag<N>];

/** FQN 평면 키 → 핸들러 시그니처. 호스트의 `expose[method]` 조회와 같은 모양이다. */
export type HostApiFlat = {
  [K in HostMethodName]: K extends `${infer N extends Ns}.${infer M}` ? Lookup<N, M> : never;
};

/** 주어진 capability 집합의 구현 타입. 키 누락·초과·시그니처 불일치가 전부 컴파일 에러다. */
export type ImplementedFlat<C extends CapabilityId> = {
  [K in MethodsOf<C>]: HostApiFlat[K];
};

// ─── 컴파일 타임 단언 ─────────────────────────────────────────────────────────

/**
 * `T`가 `never`가 아니면 컴파일 오류. 위반 항목이 에러 메시지에 그대로 찍힌다.
 *
 * `as` 캐스트를 쓰지 않는다. `const x: T = {} as T` 형태의 단언은 우변을 목표 타입으로
 * 만들어 버려 **항상 통과한다** — 그런 단언은 켜져 있어도 아무것도 잡지 못한다.
 */
type MustBeEmpty<T extends never> = T;

/**
 * 표면의 모든 메서드가 비동기이고 JSON-safe인가.
 * `Method<>`를 쓰지 않고 멤버를 손으로 적은 경우를 여기서 잡는다.
 */
type NotAsyncOrUnsafe = {
  [N in Ns]: {
    [T in Tag<N>]: {
      [M in Fn<N, T>]: HostApiSurface[N][T][M & keyof HostApiSurface[N][T]] extends (
        ...a: infer A
      ) => infer R
        ? A extends ReadonlyArray<JsonValue>
          ? R extends Promise<JsonValue | void>
            ? never
            : `${N}.${M}`
          : `${N}.${M}`
        : `${N}.${M}`;
    }[Fn<N, T>];
  }[Tag<N>];
}[Ns];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertSurfaceIsAsyncAndJsonSafe = MustBeEmpty<NotAsyncOrUnsafe>;

/** 다른 파일의 단언에서 재사용한다. */
export type { MustBeEmpty };

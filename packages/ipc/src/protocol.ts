/**
 * IPC 메시지 프로토콜 — wire 포맷 정의 + Zod 스키마 검증
 *
 * 메시지 흐름:
 *   앱 → INIT (expose 메서드명 목록)
 *   호스트 → READY (hostOrigin 포함)
 *   이후 양방향 CALL / RESULT / ERROR
 *
 * @module ipc/protocol
 */

import { z } from 'zod';

// ─── 프로토콜 버전 ────────────────────────────────────────────────────────────

// 프로토콜 진화 정책 (ADR-0036):
// - additive-only(optional 필드 추가 / 신규 메시지 타입 예약)는 버전 유지(v1).
// - 기존 필드 의미·타입 변경 또는 필수 필드 추가 등 breaking 변경 시에만 버전 bump.
export const IPC_PROTOCOL_VERSION = 1 as const;

// ─── Prototype Pollution 방어 ─────────────────────────────────────────────────

/**
 * 위험 키 거부 refinement.
 * __proto__, constructor, prototype 키를 포함한 객체를 거부한다.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function hasDangerousKey(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => DANGEROUS_KEYS.has(k));
}

// ─── 공통 필드 ────────────────────────────────────────────────────────────────

const ProtocolVersion = z.literal(IPC_PROTOCOL_VERSION);

// ─── 메시지 타입 상수 ─────────────────────────────────────────────────────────

export const MSG_TYPE = {
  INIT: 'zm_ipc_init',
  READY: 'zm_ipc_ready',
  CALL: 'zm_ipc_call',
  RESULT: 'zm_ipc_result',
  ERROR: 'zm_ipc_error',
  /** RESERVED (ADR-0036, F3): EventBus 채널. 현재 AnyIpcMsgSchema 미포함 → parseIpcMsg가 무시. */
  EVENT: 'zm_ipc_event',
} as const;

export type MsgType = (typeof MSG_TYPE)[keyof typeof MSG_TYPE];

// ─── INIT 메시지 (앱 → 호스트) ────────────────────────────────────────────────

export const InitMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.INIT),
    v: ProtocolVersion,
    /** 앱이 호스트에게 노출하는 메서드 이름 목록 */
    methods: z.array(z.string().min(1).max(64)),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type InitMsg = z.infer<typeof InitMsgSchema>;

// ─── READY 메시지 (호스트 → 앱) ───────────────────────────────────────────────

export const ReadyMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.READY),
    v: ProtocolVersion,
    /** 호스트 origin (앱이 저장해 이후 메시지 검증에 사용) */
    hostOrigin: z.string(),
    /** 호스트가 앱에게 허가한 메서드 목록 (v1: 앱이 노출한 것 중 allowedMethods 교집합) */
    grantedMethods: z.array(z.string()),
    /** RESERVED (ADR-0034, F1): 허가된 capability 토큰 목록. F0는 host가 미전송(optional). */
    grantedCapabilities: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type ReadyMsg = z.infer<typeof ReadyMsgSchema>;

// ─── CALL 메시지 (양방향) ─────────────────────────────────────────────────────

export const CallMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.CALL),
    v: ProtocolVersion,
    /** 호출 ID (응답 매핑용) */
    callId: z.string().min(1).max(64),
    /** 호출 대상 메서드 이름 */
    method: z.string().min(1).max(64),
    /** 인자 배열 */
    args: z.array(z.unknown()).max(32),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type CallMsg = z.infer<typeof CallMsgSchema>;

// ─── RESULT 메시지 (양방향) ───────────────────────────────────────────────────

export const ResultMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.RESULT),
    v: ProtocolVersion,
    /** 대응하는 CALL 메시지의 callId */
    callId: z.string().min(1).max(64),
    /** 반환값 */
    result: z.unknown(),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type ResultMsg = z.infer<typeof ResultMsgSchema>;

// ─── ERROR 메시지 (양방향) ────────────────────────────────────────────────────

export const ErrorMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.ERROR),
    v: ProtocolVersion,
    /** 대응하는 CALL 메시지의 callId (없으면 프로토콜 수준 오류) */
    callId: z.string().min(1).max(64).optional(),
    /** 에러 코드 */
    code: z.enum(['timeout', 'peer_down', 'denied', 'invalid_origin', 'protocol', 'rate_limited', 'unknown']),
    /** 에러 메시지 */
    message: z.string().max(256),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type ErrorMsg = z.infer<typeof ErrorMsgSchema>;

// ─── EVENT 메시지 (RESERVED — ADR-0036, F3 EventBus 채널) ─────────────────────
//
// ⚠️ 의도적으로 AnyIpcMsgSchema 유니온에 포함하지 않는다. 따라서 parseIpcMsg는
// event 타입 메시지를 현재 null(무시)로 처리한다 → 런타임 동작 byte-identical.
// F3에서 유니온에 추가 + host/app switch에 라우팅한다.
export const EventMsgSchema = z
  .object({
    type: z.literal(MSG_TYPE.EVENT),
    v: ProtocolVersion,
    topic: z.string().min(1).max(64),
    payload: z.unknown(),
  })
  .strict()
  .refine(
    (obj) => !hasDangerousKey(obj as Record<string, unknown>),
    { message: 'Dangerous key detected' },
  );

export type EventMsg = z.infer<typeof EventMsgSchema>;

// ─── 유니온 메시지 스키마 ─────────────────────────────────────────────────────

export const AnyIpcMsgSchema = z.discriminatedUnion('type', [
  InitMsgSchema,
  ReadyMsgSchema,
  CallMsgSchema,
  ResultMsgSchema,
  ErrorMsgSchema,
]);

export type AnyIpcMsg = z.infer<typeof AnyIpcMsgSchema>;

// ─── 파싱 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 수신 데이터를 IPC 메시지로 파싱한다.
 * 실패 시 null 반환 (throw 안 함).
 */
export function parseIpcMsg(data: unknown): AnyIpcMsg | null {
  if (data === null || typeof data !== 'object') return null;
  // 최상위 type 필드가 zm_ipc_ 접두사가 아니면 우리 메시지 아님
  const raw = data as Record<string, unknown>;
  if (typeof raw['type'] !== 'string') return null;
  if (!raw['type'].startsWith('zm_ipc_')) return null;

  const result = AnyIpcMsgSchema.safeParse(data);
  return result.success ? result.data : null;
}

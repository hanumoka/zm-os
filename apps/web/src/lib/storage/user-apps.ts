/**
 * 사용자 업로드 앱 영속화 계층 (APP-02 / STG-01 연계)
 *
 * `user-apps` namespace를 통해 사용자가 업로드한 앱을 읽고 쓴다.
 * installed-apps.ts 패턴 복제 (domain wrapper).
 *
 * SSR 안전: 어댑터가 IDB 부재 시 메모리로 폴백한다.
 * 'use client' 미사용 — lib 모듈, 호출자(UserAppsProvider 등)가 client 컴포넌트.
 *
 * 저수준 idb CRUD를 직접 쓰지 않고 BlobStorage 어댑터를 경유한다. 직접 쓰면 파티션
 * 스코프 키 경계를 우회하게 되어, 접두사 없는 레코드가 생긴다(zm-docs `contracts.md` §2).
 */

import { resolveAdapterFor } from '@zm/storage';
import { NS_USER_APPS } from '@zm/core';
import type { ParsedUserApp } from '@/lib/apps/zip-loader';

const NAMESPACE = NS_USER_APPS;

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/**
 * IDB user-apps store 레코드.
 * P3=α: ParsedUserApp + installedAt
 */
export type UserAppRecord = ParsedUserApp & {
  /** 최초 업로드(설치) 시각 (epoch ms) */
  installedAt: number;
};

// ─── 조회 ─────────────────────────────────────────────────────────────────────

/**
 * IDB user-apps store 전체를 조회해 UserAppRecord 배열을 반환한다.
 *
 * - SSR / IDB 차단 / 빈 store → [] 반환 (throw 없음 — 어댑터 내부 폴백)
 * - 호출자(client 컴포넌트)가 fire-and-forget hydration 권장
 */
export async function listUserApps(): Promise<ReadonlyArray<UserAppRecord>> {
  const items = await resolveAdapterFor(NAMESPACE).list<UserAppRecord>(NAMESPACE);
  return items.map((it) => it.value);
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────

/**
 * 사용자 앱 레코드를 영속화한다 (upsert — idempotent).
 *
 * key는 record.manifest.id를 사용한다.
 * 이미 존재하는 id에 대해 레코드 전체가 교체된다 (재업로드 시각 반영).
 * 호출자가 fire-and-forget으로 호출하므로 throw 시 호출자가 catch.
 */
export async function saveUserApp(record: UserAppRecord): Promise<void> {
  await resolveAdapterFor(NAMESPACE).put<UserAppRecord>(NAMESPACE, record.manifest.id, record);
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

/**
 * 사용자 앱 레코드를 삭제한다.
 *
 * 존재하지 않는 id여도 throw 없음 (delete는 idempotent).
 * 호출자가 fire-and-forget으로 호출하므로 throw 시 호출자가 catch.
 */
export async function deleteUserApp(id: string): Promise<void> {
  await resolveAdapterFor(NAMESPACE).delete(NAMESPACE, id);
}

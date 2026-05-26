/**
 * 사용자 업로드 앱 영속화 계층 (APP-02 / STG-01 연계)
 *
 * IndexedDB STORE_USER_APPS store를 통해 사용자가 업로드한 앱을 읽고 쓴다.
 * installed-apps.ts 패턴 복제 (domain wrapper).
 *
 * SSR 안전: IDB 접근은 isIDBAvailable() 가드를 idbList/idbPut/idbDelete에서 자동 처리.
 * 'use client' 미사용 — lib 모듈, 호출자(UserAppsProvider 등)가 client 컴포넌트.
 */

import { STORE_USER_APPS, idbList, idbPut, idbDelete } from '@zm/storage';
import type { ParsedUserApp } from '@/lib/apps/zip-loader';

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
 * - SSR / IDB 차단 / 빈 store → [] 반환 (throw 없음 — idbList 내부 폴백)
 * - 호출자(client 컴포넌트)가 fire-and-forget hydration 권장
 */
export async function listUserApps(): Promise<ReadonlyArray<UserAppRecord>> {
  const items = await idbList<UserAppRecord>(STORE_USER_APPS);
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
  await idbPut<UserAppRecord>(STORE_USER_APPS, record.manifest.id, record);
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

/**
 * 사용자 앱 레코드를 삭제한다.
 *
 * 존재하지 않는 id여도 throw 없음 (idbDelete는 idempotent).
 * 호출자가 fire-and-forget으로 호출하므로 throw 시 호출자가 catch.
 */
export async function deleteUserApp(id: string): Promise<void> {
  await idbDelete(STORE_USER_APPS, id);
}

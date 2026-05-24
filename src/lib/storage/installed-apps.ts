/**
 * 설치된 앱 영속화 계층 (APP-03 / STG-01 연계)
 *
 * IndexedDB를 통해 설치된 앱 목록을 읽고 쓴다.
 * SSR 안전: IDB 접근은 isIDBAvailable() 가드를 idbList/idbPut/idbDelete에서 자동 처리.
 * 'use client' 미사용 — lib 모듈, 호출자(InstalledAppsProvider)가 client 컴포넌트.
 */

import { STORE_INSTALLED_APPS, idbList, idbPut, idbDelete } from './indexeddb';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** IDB installed-apps store 레코드 (P5=III: id + installedAt) */
export type InstalledAppRecord = {
  /** 앱 ID (스토어 카탈로그의 appId와 동일) */
  id: string;
  /** 최초 설치 시각 (epoch ms) */
  installedAt: number;
};

// ─── 조회 ─────────────────────────────────────────────────────────────────────

/**
 * IDB installed-apps store 전체를 조회해 id 배열을 반환한다.
 *
 * - SSR / IDB 차단 / 빈 store → [] 반환 (throw 없음 — idbList 내부 폴백)
 * - fire-and-forget hydration 권장: 호출자(InstalledAppsProvider)가 cancelled flag로 취소
 */
export async function listInstalledAppIds(): Promise<ReadonlyArray<string>> {
  const records = await idbList<InstalledAppRecord>(STORE_INSTALLED_APPS);
  return records.map((r) => r.key);
}

// ─── 저장 ─────────────────────────────────────────────────────────────────────

/**
 * 앱 설치를 영속화한다 (upsert — idempotent).
 *
 * 이미 존재하는 id에 대해 installedAt이 현재 시각으로 갱신된다 (재설치 시각 반영).
 * 최초 설치 시각 보존이 필요해질 경우 idbGet 선조회 후 조건부 put으로 reshape (v2 후보).
 * 호출자가 fire-and-forget으로 호출하므로 throw 시 호출자가 catch.
 */
export async function persistInstalledApp(id: string): Promise<void> {
  const record: InstalledAppRecord = { id, installedAt: Date.now() };
  await idbPut(STORE_INSTALLED_APPS, id, record);
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

/**
 * 앱 제거를 영속화한다.
 *
 * 존재하지 않는 id여도 throw 없음 (idbDelete는 idempotent).
 * 호출자가 fire-and-forget으로 호출하므로 throw 시 호출자가 catch.
 */
export async function removeInstalledApp(id: string): Promise<void> {
  await idbDelete(STORE_INSTALLED_APPS, id);
}

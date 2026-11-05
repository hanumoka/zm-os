import { randomUUID } from "node:crypto";
import { isUtf8 } from "node:buffer";
import type { PoolClient } from "pg";
import { z } from "zod";
import { CLOUD_LIMITS, cloudSchemas, type CloudRecord, type CloudWriteResult, type JsonValue } from "@zm/platform-contracts";
import type { SessionRow } from "./apps.js";
import { audit, one } from "./db.js";
import { ensure, hash } from "./common.js";

interface Space { app_user_id: string; generation: string; used_bytes: number }
interface RecordRow { value: JsonValue; revision: number; schema_version: number; bytes: number; deleted: boolean; updated_at: Date }
const requestSchema = z.object({
  method: z.enum(["cloud.get", "cloud.put", "cloud.remove", "cloud.list"]),
  params: z.record(z.string(), z.unknown()),
}).strict();

async function spaceFor(db: PoolClient, appUserId: string): Promise<Space> {
  await db.query("INSERT INTO cloud_spaces(app_user_id,generation) VALUES($1,$2) ON CONFLICT DO NOTHING", [appUserId, randomUUID()]);
  return (await one<Space>(db, "SELECT * FROM cloud_spaces WHERE app_user_id=$1 FOR UPDATE", [appUserId]))!;
}
function metadata(space: Space, row?: RecordRow): CloudWriteResult {
  return { generation: space.generation, revision: row?.revision ?? 0, exists: row ? !row.deleted : false,
    schemaVersion: row?.schema_version ?? 1, updatedAt: row?.updated_at.toISOString() ?? null };
}
function compatibleJson(value: JsonValue): boolean {
  if (typeof value === "string") {
    // PostgreSQL JSONB rejects NUL and unpaired UTF-16 surrogates.
    if (value.includes("\u0000")) return false;
    for (let i=0;i<value.length;i++) {
      const unit=value.charCodeAt(i);
      if (unit>=0xd800&&unit<=0xdbff) { const next=value.charCodeAt(++i); if(!(next>=0xdc00&&next<=0xdfff))return false; }
      else if(unit>=0xdc00&&unit<=0xdfff)return false;
    }
    return isUtf8(Buffer.from(value));
  }
  if (Array.isArray(value)) return value.every(compatibleJson);
  if (value !== null && typeof value === "object") return Object.entries(value).every(([key, item]) => compatibleJson(key) && compatibleJson(item));
  return true;
}

/** Called only inside Platform's mutation transaction after actor + validSession. */
export async function cloudRequest(db: PoolClient, session: SessionRow, input: unknown): Promise<JsonValue> {
  ensure(session.manifest.permissions.includes("cloud-storage"), 403, "PERMISSION_DENIED", "서버 저장 권한이 없습니다.");
  const request = requestSchema.parse(input);
  const space = await spaceFor(db, session.app_user_id);
  const rate = await one<{ requests: number }>(db,
    "UPDATE cloud_spaces SET requests=CASE WHEN window_started_at<now()-interval '1 minute' THEN 1 ELSE requests+1 END,window_started_at=CASE WHEN window_started_at<now()-interval '1 minute' THEN now() ELSE window_started_at END WHERE app_user_id=$1 RETURNING requests", [session.app_user_id]);
  ensure(rate!.requests <= CLOUD_LIMITS.requestsPerMinute, 429, "CLOUD_RATE_LIMITED", "저장 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
  if (request.method === "cloud.list") {
    const data = cloudSchemas["cloud.list"].parse(request.params), limit = data.limit ?? 50;
    const rows = (await db.query<{ key: string }>("SELECT key FROM cloud_records WHERE app_user_id=$1 AND NOT deleted AND key COLLATE \"C\">$2 COLLATE \"C\" ORDER BY key COLLATE \"C\" LIMIT $3",
      [session.app_user_id, data.cursor ?? "", limit + 1])).rows;
    const keys = rows.slice(0, limit).map(row => row.key);
    return { generation: space.generation, keys, nextCursor: rows.length > limit ? keys[keys.length - 1]! : null };
  }
  if (request.method === "cloud.get") {
    const data = cloudSchemas["cloud.get"].parse(request.params);
    const row = await one<RecordRow>(db, "SELECT * FROM cloud_records WHERE app_user_id=$1 AND key=$2", [session.app_user_id, data.key]);
    const result: CloudRecord = { ...metadata(space, row), value: row && !row.deleted ? row.value : null };
    return result;
  }
  const data = request.method === "cloud.put" ? cloudSchemas["cloud.put"].parse(request.params) : cloudSchemas["cloud.remove"].parse(request.params);
  ensure(data.generation === space.generation, 409, "CLOUD_STALE_GENERATION", "서버 데이터가 초기화되었습니다. 앱을 다시 열어 확인해 주세요.");
  // Hash the validated request, not any user-provided identity. Never retain a second plaintext copy.
  const signature = hash(JSON.stringify({ method: request.method, data }));
  await db.query("DELETE FROM cloud_receipts WHERE app_user_id=$1 AND expires_at<=now()", [session.app_user_id]);
  const receipt = await one<{ signature: string; result: CloudWriteResult }>(db, "SELECT signature,result FROM cloud_receipts WHERE app_user_id=$1 AND request_id=$2", [session.app_user_id, data.requestId]);
  if (receipt) {
    ensure(receipt.signature === signature, 409, "CLOUD_REQUEST_REUSED", "같은 요청 ID에 다른 내용을 사용할 수 없습니다.");
    return receipt.result;
  }
  const row = await one<RecordRow>(db, "SELECT * FROM cloud_records WHERE app_user_id=$1 AND key=$2 FOR UPDATE", [session.app_user_id, data.key]);
  ensure((row?.revision ?? 0) === data.expectedRevision, 409, "CLOUD_REVISION_CONFLICT", "다른 기기에서 메모가 변경되었습니다. 최신 내용과 비교해 주세요.");
  const counts = (await one<{ keys: number; receipts: number }>(db,
    "SELECT (SELECT count(*)::int FROM cloud_records WHERE app_user_id=$1) AS keys,(SELECT count(*)::int FROM cloud_receipts WHERE app_user_id=$1) AS receipts", [session.app_user_id]))!;
  ensure(row || counts.keys < CLOUD_LIMITS.keys, 413, "CLOUD_QUOTA_EXCEEDED", "저장할 수 있는 키 수를 넘었습니다. 삭제 표식은 앱 데이터 전체 삭제로 정리할 수 있습니다.");
  ensure(counts.receipts < CLOUD_LIMITS.receipts, 429, "CLOUD_RECEIPT_LIMIT", "안전한 재시도 기록의 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.");
  const removing = request.method === "cloud.remove";
  const value: JsonValue = "value" in data ? data.value as JsonValue : null;
  ensure(compatibleJson(value), 400, "INVALID_VALUE", "저장할 수 없는 문자열이 포함되어 있습니다.");
  const bytes = removing ? 0 : Buffer.byteLength(JSON.stringify(value), "utf8") + Buffer.byteLength(data.key, "utf8");
  const total = space.used_bytes - (row?.bytes ?? 0) + bytes;
  ensure(bytes <= CLOUD_LIMITS.recordBytes && total <= CLOUD_LIMITS.spaceBytes, 413, "CLOUD_QUOTA_EXCEEDED", "서버 저장 용량을 초과했습니다. 메모 크기를 줄여 주세요.");
  const schemaVersion = "schemaVersion" in data ? data.schemaVersion : row?.schema_version ?? 1;
  const changed = (await one<RecordRow>(db,
    "INSERT INTO cloud_records(app_user_id,key,value,revision,schema_version,bytes,deleted) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(app_user_id,key) DO UPDATE SET value=EXCLUDED.value,revision=EXCLUDED.revision,schema_version=EXCLUDED.schema_version,bytes=EXCLUDED.bytes,deleted=EXCLUDED.deleted,updated_at=now() RETURNING *",
    [session.app_user_id, data.key, removing ? null : JSON.stringify(value), data.expectedRevision + 1, schemaVersion, bytes, removing]))!;
  await db.query("UPDATE cloud_spaces SET used_bytes=$2 WHERE app_user_id=$1", [session.app_user_id, total]);
  const result = metadata(space, changed);
  await db.query("INSERT INTO cloud_receipts(app_user_id,request_id,signature,result) VALUES($1,$2,$3,$4)", [session.app_user_id, data.requestId, signature, result]);
  return result;
}

/** Account action remains available after consent withdrawal / app suspension. Live + preview scopes are explicit. */
export async function clearCloud(db: PoolClient, userId: string, appId: string, isPreview: boolean): Promise<{ ok: true }> {
  const appUser = await one<{ id: string }>(db, "SELECT id FROM app_users WHERE user_id=$1 AND app_id=$2 AND is_preview=$3", [userId, appId, isPreview]);
  ensure(appUser, 404, "NOT_FOUND", "본인이 이용한 앱의 저장 영역만 삭제할 수 있습니다.");
  await spaceFor(db, appUser.id);
  await db.query("UPDATE cloud_spaces SET generation=$2,used_bytes=0,requests=0,window_started_at=now() WHERE app_user_id=$1", [appUser.id, randomUUID()]);
  await db.query("DELETE FROM cloud_records WHERE app_user_id=$1", [appUser.id]);
  await db.query("DELETE FROM cloud_receipts WHERE app_user_id=$1", [appUser.id]);
  await db.query("UPDATE app_sessions SET status='revoked' WHERE user_id=$1 AND app_user_id=$2", [userId, appUser.id]);
  await audit(db, userId, "cloud.cleared", appId, { isPreview });
  return { ok: true };
}

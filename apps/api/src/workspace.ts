import type { PoolClient } from "pg";
import { defaultWorkspace, workspaceWriteSchema, type WorkspaceData, type WorkspaceView } from "@zm/platform-contracts";
import { one } from "./db.js";
import { ensure, hash } from "./common.js";

interface WorkspaceRow {
  revision: number;
  data: WorkspaceData;
  updated_at: Date;
  last_request_id: string;
  last_request_hash: string;
}
function view(userId: string, row?: WorkspaceRow): WorkspaceView {
  return { userId, revision: row?.revision ?? 0, workspace: row?.data ?? defaultWorkspace(),
    updatedAt: row?.updated_at.toISOString() ?? null, lastRequestId: row?.last_request_id ?? null };
}
export async function readWorkspace(db: PoolClient, userId: string, expectedUserId: unknown): Promise<WorkspaceView> {
  ensure(expectedUserId === userId, 409, "CURRENT_ACCOUNT_CHANGED", "로그인 계정이 바뀌어 작업공간을 조회하지 않았습니다.");
  return view(userId, await one<WorkspaceRow>(db, "SELECT * FROM workspaces WHERE user_id=$1", [userId]));
}
export async function writeWorkspace(db: PoolClient, userId: string, body: unknown): Promise<WorkspaceView> {
  const data = workspaceWriteSchema.parse(body);
  ensure(data.expectedUserId === userId, 409, "CURRENT_ACCOUNT_CHANGED", "로그인 계정이 바뀌어 저장하지 않았습니다.");
  const previous = await one<WorkspaceRow>(db, "SELECT * FROM workspaces WHERE user_id=$1 FOR UPDATE", [userId]);
  const signature = hash(JSON.stringify({ revision: data.revision, workspace: data.workspace }));
  if (previous?.last_request_id === data.requestId) {
    ensure(previous.last_request_hash === signature, 409, "WORKSPACE_REQUEST_REUSED", "같은 저장 요청을 다른 내용으로 재사용할 수 없습니다.");
    return view(userId, previous);
  }
  ensure((previous?.revision ?? 0) === data.revision, 409, "WORKSPACE_CONFLICT", "다른 창이나 기기에서 작업공간을 변경했습니다. 사용할 설정을 선택해 주세요.");
  const updated = await one<WorkspaceRow>(db, `INSERT INTO workspaces(user_id,revision,data,last_request_id,last_request_hash)
    VALUES($1,1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET revision=workspaces.revision+1,
    data=EXCLUDED.data,last_request_id=EXCLUDED.last_request_id,last_request_hash=EXCLUDED.last_request_hash,updated_at=now() RETURNING *`,
  [userId, JSON.stringify(data.workspace), data.requestId, signature]);
  return view(userId, updated);
}

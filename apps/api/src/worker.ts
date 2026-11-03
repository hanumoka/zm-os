import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { validateZip } from "@zm/cli";
import { Database, one, audit } from "./db.js";
import type { Config } from "./config.js";
import { hash } from "./common.js";

export async function workOnce(db: Database, cfg: Config): Promise<boolean> {
  const job = await db.transaction(async (tx) => {
    await tx.query(
      "UPDATE versions SET validation_status='failed',validation_error='검사 작업 재시도 횟수 초과' WHERE id IN(SELECT version_id FROM bundle_jobs WHERE status='running' AND lease_until<now() AND attempts>=3)",
    );
    await tx.query(
      "UPDATE bundle_jobs SET status='failed',error='검사 작업 재시도 횟수 초과',lease_until=NULL WHERE status='running' AND lease_until<now() AND attempts>=3",
    );
    const row = await one<{
      id: string;
      version_id: string;
      app_id: string;
      hash: string;
      revision: number;
    }>(
      tx,
      "SELECT j.id,j.version_id,j.revision,v.app_id,v.hash FROM bundle_jobs j JOIN versions v ON v.id=j.version_id WHERE (j.status IN ('queued','retry_wait') OR (j.status='running' AND j.lease_until<now())) AND j.attempts<3 ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1",
    );
    if (!row) return undefined;
    await tx.query(
      "UPDATE bundle_jobs SET status='running',attempts=attempts+1,revision=revision+1,lease_until=now()+interval '30 seconds' WHERE id=$1",
      [row.id],
    );
    await tx.query(
      "UPDATE versions SET validation_status='running' WHERE id=$1",
      [row.version_id],
    );
    return { ...row, revision: row.revision + 1 };
  });
  if (job) {
    try {
      const raw = await readFile(
        join(cfg.files, "uploads", `${job.version_id}.zip`),
      );
      if (hash(raw) !== job.hash) throw new Error("번들 지문이 바뀌었습니다.");
      const bundle = await validateZip(raw, {
        expectedAppId: job.app_id,
        allowLocalHttp: true,
      });
      // Each lease writes to its own directory. Only its current revision can become authoritative.
      const directory = join(
        cfg.files,
        "prepared",
        `${job.version_id}-${job.revision}`,
      );
      await mkdir(directory, { recursive: true });
      for (const file of bundle.files) {
        const target = join(directory, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.data, { flag: "wx" });
      }
      await db.transaction(async (tx) => {
        const owned = await one(
          tx,
          "SELECT 1 FROM bundle_jobs WHERE id=$1 AND revision=$2 AND status='running' AND lease_until>now()",
          [job.id, job.revision],
        );
        if (!owned) return;
        await tx.query(
          "UPDATE bundle_jobs SET status='completed',lease_until=NULL WHERE id=$1",
          [job.id],
        );
        await tx.query(
          "UPDATE versions SET validation_status='passed',validation_error='',asset_revision=$2 WHERE id=$1",
          [job.version_id, job.revision],
        );
        await audit(tx, null, "bundle.prepared", job.version_id, {
          hash: job.hash,
          revision: job.revision,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "번들 검사 실패";
      await db.transaction(async (tx) => {
        const changed = await tx.query(
          "UPDATE bundle_jobs SET status=CASE WHEN attempts<3 THEN 'retry_wait' ELSE 'failed' END,error=$1,lease_until=NULL WHERE id=$2 AND revision=$3 AND status='running' RETURNING status",
          [message.slice(0, 400), job.id, job.revision],
        );
        if (changed.rowCount)
          await tx.query(
            "UPDATE versions SET validation_status=CASE WHEN $1='failed' THEN 'failed' ELSE 'pending' END,validation_error=$2 WHERE id=$3",
            [changed.rows[0]?.status, message.slice(0, 400), job.version_id],
          );
      });
    }
    return true;
  }
  return db.transaction(async (tx) => {
    const withdrawal = await one<{ id: string; user_id: string }>(
      tx,
      "SELECT id,user_id FROM withdrawals WHERE platform_status IN ('queued','retry_wait') FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!withdrawal) return false;
    // The old IDs remain as tombstones for audit / external deletion. Completion explicitly means this live profile only.
    await tx.query("DELETE FROM email_credentials WHERE user_id=$1", [withdrawal.user_id]);
    await tx.query("DELETE FROM email_challenges WHERE user_id=$1", [withdrawal.user_id]);
    await tx.query("DELETE FROM identities WHERE user_id=$1", [
      withdrawal.user_id,
    ]);
    await tx.query("DELETE FROM my_apps WHERE user_id=$1", [
      withdrawal.user_id,
    ]);
    await tx.query("DELETE FROM consents WHERE user_id=$1", [
      withdrawal.user_id,
    ]);
    await tx.query(
      "UPDATE developer_applications SET display_name='탈퇴 계정',email='',description='',reason='' WHERE user_id=$1",
      [withdrawal.user_id],
    );
    await tx.query(
      "UPDATE reports SET reason='탈퇴 후 내용 삭제' WHERE user_id=$1",
      [withdrawal.user_id],
    );
    await tx.query(
      "UPDATE withdrawals SET platform_status='completed' WHERE id=$1",
      [withdrawal.id],
    );
    await audit(tx, null, "withdrawal.profile_removed", withdrawal.id, {
      jobId: randomUUID(),
      scope: "live_identity_and_profile_only",
    });
    return true;
  });
}

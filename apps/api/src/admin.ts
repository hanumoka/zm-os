import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Database, one, audit } from "./db.js";
import { config } from "./config.js";
import { ensure } from "./common.js";

// Local deployment operator only. This module is never mounted as an HTTP route.
const values: Record<string, string> = JSON.parse(
  await readFile(
    new URL("../../../.trial/config.json", import.meta.url),
    "utf8",
  ),
);
for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
const db = new Database(config().databaseUrl);
try {
  const action = z.enum(["list", "grant", "revoke"]).parse(process.argv[2]);
  await db.migrate();
  if (action === "list") {
    const result = await db.pool.query(
      "SELECT u.id,u.status,u.operator,array_agg(i.provider ORDER BY i.provider) AS providers FROM users u JOIN identities i ON i.user_id=u.id WHERE u.status<>'withdrawn' GROUP BY u.id ORDER BY u.created_at",
    );
    process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
  } else {
    const id = z.string().uuid().parse(process.argv[3]);
    await db.transaction(async (tx) => {
      const target = await one<{ status: string; operator: boolean }>(
        tx,
        "SELECT status,operator FROM users WHERE id=$1",
        [id],
      );
      ensure(target?.status === "active", 409, "ACTIVE_ACCOUNT_REQUIRED");
      ensure(
        await one(tx, "SELECT 1 FROM identities WHERE user_id=$1", [id]),
        409,
        "AUTHENTICATED_ACCOUNT_REQUIRED",
      );
      if (action === "revoke" && target.operator) {
        const remaining = await one<{ count: string }>(
          tx,
          "SELECT count(*) FROM users WHERE operator AND status='active' AND id<>$1",
          [id],
        );
        ensure(Number(remaining?.count) > 0, 409, "LAST_OPERATOR");
      }
      await tx.query("UPDATE users SET operator=$1 WHERE id=$2", [
        action === "grant",
        id,
      ]);
      await audit(tx, null, `operator.local_${action}`, id, {
        origin: "local-deployment-cli",
      });
    });
    process.stdout.write(`운영자 권한 ${action} 처리 완료\n`);
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "처리 실패"}\n`,
  );
  process.exitCode = 1;
} finally {
  await db.close();
}

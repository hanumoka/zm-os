import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { PoolClient, QueryResultRow } from "pg";

export class Database {
  readonly pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 8 });
  }
  async migrate(): Promise<void> {
    const schema=await readFile(new URL("./schema.sql", import.meta.url), "utf8");
    await this.transaction(async client=>{await client.query(schema);});
  }
  async transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Trial mutation gate: avoids policy check/write races across HTTP and worker processes.
      // This is intentionally not a claim of production throughput; narrow row locks require load evidence.
      await client.query("SELECT pg_advisory_xact_lock(7211042)");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
export async function one<T extends QueryResultRow>(
  db: PoolClient,
  sql: string,
  args: unknown[] = [],
): Promise<T | undefined> {
  return (await db.query<T>(sql, args)).rows[0];
}
export async function audit(
  db: PoolClient,
  actor: string | null,
  action: string,
  target: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    "INSERT INTO audit_events(id,actor_id,action,target_id,detail) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, action, target, detail],
  );
}

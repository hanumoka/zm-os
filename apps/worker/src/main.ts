import { readFileSync } from "node:fs";
import { Database } from "../../api/src/db.js";
import { config } from "../../api/src/config.js";
import { workOnce } from "../../api/src/worker.js";
const values: Record<string, string> = JSON.parse(
  readFileSync(new URL("../../../.trial/config.json", import.meta.url), "utf8"),
);
for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
const cfg = config(),
  db = new Database(cfg.databaseUrl);
let running = true;
process.once("SIGINT", () => {
  running = false;
});
process.once("SIGTERM", () => {
  running = false;
});
await db.migrate();
while (running) {
  try {
    if (!(await workOnce(db, cfg)))
      await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error(
      "worker failed",
      error instanceof Error ? error.name : "unknown",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
await db.close();

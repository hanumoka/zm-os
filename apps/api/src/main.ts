import "reflect-metadata";
import { All, Controller, Module, Req, Res } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { Database } from "./db.js";
import { Platform } from "./platform.js";
import { ApiError } from "./common.js";
import { serveAssets } from "./assets.js";

const envPath = new URL("../../../.trial/config.json", import.meta.url);
if (existsSync(envPath)) {
  const values: Record<string, string> = JSON.parse(
    readFileSync(envPath, "utf8"),
  );
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
}
const cfg = config();
const db = new Database(cfg.databaseUrl);
const platform = new Platform(db, cfg);
@Controller("v1")
class ApiController {
  @All("{*path}")
  async dispatch(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const data = await platform.handle(req, res);
      if (!res.headersSent) {
        if (res.locals.redirect)
          res.redirect(
            res.locals.redirectStatus ?? 302,
            String(res.locals.redirect),
          );
        else if (Buffer.isBuffer(data)) res.type("application/zip").send(data);
        else res.json(data === undefined ? { ok: true } : data);
      }
    } catch (error) {
      if (res.headersSent) return;
      if (error instanceof ApiError)
        res
          .status(error.status)
          .json({ code: error.code, message: error.message });
      else if (error instanceof ZodError)
        res
          .status(400)
          .json({
            code: "INVALID_INPUT",
            message: error.issues.map((i) => i.message).join("; "),
          });
      else if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      )
        res
          .status(409)
          .json({
            code: "DUPLICATE",
            message: "이미 존재하거나 처리 중인 요청입니다.",
          });
      else {
        console.error(
          "API request failed",
          error instanceof Error ? error.name : "unknown",
        );
        res
          .status(500)
          .json({
            code: "INTERNAL_ERROR",
            message: "처리를 완료하지 못했습니다.",
          });
      }
    }
  }
}
@Module({ controllers: [ApiController] })
class ApiModule {}
await db.migrate();
const app = await NestFactory.create(ApiModule, {
  bodyParser: false,
  logger: ["error", "warn"],
});
app.use((req: Request, res: Response, next: () => void) => {
  res.set({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (
    req.headers.origin &&
    req.headers.origin !== cfg.webOrigin &&
    !req.path.startsWith("/v1/app-auth/")
  ) {
    res
      .status(403)
      .json({ code: "ORIGIN_DENIED", message: "허용되지 않은 origin입니다." });
    return;
  }
  next();
});
app.use(express.raw({ type: "application/zip", limit: "5mb" }));
app.use(express.json({ limit: "96kb" }));
app.use(express.urlencoded({ extended: false, limit: "4kb" }));
await app.listen(cfg.port, "127.0.0.1");
const assets = await serveAssets(db, cfg);
console.info(
  `zm-os local API ready on ${cfg.port}; assets ${cfg.assetPort}; ${fileURLToPath(new URL(".", import.meta.url))}`,
);
async function close(): Promise<void> {
  assets.close();
  await app.close();
  await db.close();
  process.exit(0);
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

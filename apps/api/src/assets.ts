import express from "express";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { z } from "zod";
import { validatePath } from "@zm/cli";
import { Database, one } from "./db.js";
import { validSession, documentGrant } from "./apps.js";
import { equal } from "./common.js";
import type { Config } from "./config.js";

export async function serveAssets(db: Database, cfg: Config): Promise<Server> {
  const app = express();
  app.disable("x-powered-by");
  app.use(async (req, res) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.sendStatus(405);
        return;
      }
      const parts = req.path.split("/");
      if (parts[1] !== "apps") throw new Error("path");
      const sessionId = z.string().uuid().parse(parts[2]),
        versionId = z.string().uuid().parse(parts[3]);
      const grant = parts[4] ?? "";
      const relative = decodeURIComponent(parts.slice(5).join("/"));
      validatePath(relative);
      const session = await db.transaction((tx) => validSession(tx, sessionId));
      if (
        session.version_id !== versionId ||
        !equal(grant, documentGrant(session, cfg))
      )
        throw new Error("grant");
      const csp = `default-src 'none'; script-src ${cfg.assetOrigin} 'unsafe-inline'; style-src ${cfg.assetOrigin} 'unsafe-inline'; img-src ${cfg.assetOrigin} data:; font-src ${cfg.assetOrigin}; media-src ${cfg.assetOrigin}; connect-src ${session.manifest.apiOrigins.join(" ") || "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors ${cfg.webOrigin}; sandbox allow-scripts`;
      res.set("Content-Security-Policy", csp);
      res.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
      );
      const version = await db.transaction((tx) =>
        one<{ asset_revision: number }>(
          tx,
          "SELECT asset_revision FROM versions WHERE id=$1 AND validation_status='passed'",
          [versionId],
        ),
      );
      if (!version?.asset_revision) throw new Error("asset");
      const data = await readFile(
        join(
          cfg.files,
          "prepared",
          `${versionId}-${version.asset_revision}`,
          relative,
        ),
      );
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".ico": "image/x-icon",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".webp": "image/webp",
        ".wasm": "application/wasm",
        ".woff2": "font/woff2",
      };
      res
        .type(
          mime[extname(relative).toLowerCase()] ?? "application/octet-stream",
        )
        .send(data);
    } catch {
      res.status(403).type("text/plain").send("앱 자원을 사용할 수 없습니다.");
    }
  });
  return new Promise((resolve) => {
    const server = app.listen(cfg.assetPort, "127.0.0.1", () =>
      resolve(server),
    );
  });
}

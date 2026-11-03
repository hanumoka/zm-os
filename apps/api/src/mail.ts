import { createServer, type Server } from "node:http";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

export interface TrialMail { id: string; to: string; subject: string; url: string; createdAt: string; expiresAt: string }
export const mailboxUrl = (cfg: Config): string => "http://localhost:" + (cfg.port + 2);
export async function captureMail(cfg: Config, to: string, purpose: string, token: string, files: string[]): Promise<void> {
  const directory = join(cfg.files, "mail");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const id = randomUUID(), path = join(directory, id + ".json");
  const mail: TrialMail = {
    id, to, subject: purpose === "reset" ? "zm-os 비밀번호 재설정" : "zm-os 이메일 인증",
    url: cfg.webOrigin + "/#email=" + purpose + "&token=" + encodeURIComponent(token),
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  files.push(path);
  await writeFile(path, JSON.stringify(mail), { mode: 0o600, flag: "wx" });
}
export async function readTrialMail(cfg: Config): Promise<TrialMail[]> {
  const directory = join(cfg.files, "mail"), result: TrialMail[] = [];
  for (const name of await readdir(directory).catch(() => [] as string[])) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const path = join(directory, name);
    try {
      const mail = JSON.parse(await readFile(path, "utf8")) as TrialMail;
      if (Date.parse(mail.expiresAt) <= Date.now()) { await unlink(path); continue; }
      if (typeof mail.to === "string" && typeof mail.subject === "string" && typeof mail.url === "string" && new URL(mail.url).origin === cfg.webOrigin)
        result.push(mail);
    } catch { /* Concurrent cleanup or invalid local capture: do not expose it. */ }
  }
  return result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export async function serveTrialMailbox(cfg: Config): Promise<Server | undefined> {
  // Explicit mock-auth mode only. This is a development tool, never an app API.
  if (!cfg.testAuth) return undefined;
  const port = cfg.port + 2, origin = mailboxUrl(cfg);
  const server = createServer((req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      if (req.method !== "GET" || req.url !== "/" ||
          !["localhost:" + port, "127.0.0.1:" + port].includes(req.headers.host ?? "") ||
          (req.headers.origin && req.headers.origin !== origin) ||
          (["cross-site","same-site"].includes(String(req.headers["sec-fetch-site"] ?? "")) && req.headers["sec-fetch-mode"]!=="navigate")) {
        res.writeHead(403);res.end("Forbidden");return;
      }
      const mail = await readTrialMail(cfg);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>zm-os 개발용 메일함</title><style>body{font:16px/1.6 system-ui;margin:32px auto;padding:0 24px;max-width:900px;background:#f4f6fa;color:#17253b}article{background:white;border:1px solid #ccd6e3;padding:20px;margin:16px 0;border-radius:8px}a{color:#1455b0}p{overflow-wrap:anywhere}</style><h1>개발용 메일함</h1><p>이 기기의 로컬 시험 메일입니다. 외부 주소로 발송하지 않습니다. 인증 링크는 15분 후 만료됩니다.</p><a href="/">새로고침</a>' +
        mail.map(item => '<article><h2>' + escape(item.subject) + '</h2><p>받는 주소: ' + escape(item.to) + '</p><p>' + escape(item.createdAt) + '</p><a rel="noreferrer" href="' + escape(item.url) + '">인증 화면 열기</a></article>').join("") +
        (mail.length ? "" : "<p>아직 메일이 없습니다. 가입 또는 비밀번호 재설정을 요청한 뒤 새로고침해 주세요.</p>") + "</html>");
    })().catch(() => { res.statusCode = 500; res.end("메일함을 읽지 못했습니다."); });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, ".trial"),
  configPath = join(directory, "config.json");
const command = process.argv[2] ?? "start";
const container = "zm-os-platform-trial-db";
const run = (args) => {
  const result = spawnSync("docker", args, {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Docker 명령 실패");
};
await mkdir(directory, { recursive: true });
if (command === "stop") {
  run(["stop", container]);
  process.exit(0);
}
let config;
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch {
  if (command === "reset")
    throw new Error("이 작업에서 생성한 시험 설정이 없습니다.");
  const password = randomBytes(24).toString("hex");
  config = {
    ZM_MODE: "local-test",
    ZM_TEST_AUTH: "1",
    DATABASE_URL: `postgresql://zmtrial:${password}@127.0.0.1:15438/zmtrial`,
    ZM_ASSET_SECRET: randomBytes(32).toString("hex"),
    ZM_FILES: join(directory, "files"),
    WEB_ORIGIN: "http://localhost:4300",
    ASSET_ORIGIN: "http://localhost:4311",
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
}
if (command === "reset") {
  if (!process.argv.includes("--confirm-trial-data"))
    throw new Error("시험 데이터 삭제에는 --confirm-trial-data가 필요합니다.");
  const inspect = spawnSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "zm-os.trial"}}',
      container,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (inspect.stdout.trim() !== "platform-rebuild")
    throw new Error("소유가 확인되지 않은 컨테이너는 삭제하지 않습니다.");
  run(["rm", "-f", container]);
  process.exit(0);
}
const inspect = spawnSync(
  "docker",
  ["inspect", "--format", '{{index .Config.Labels "zm-os.trial"}}', container],
  { encoding: "utf8", windowsHide: true },
);
if (inspect.status === 0) {
  if (inspect.stdout.trim() !== "platform-rebuild")
    throw new Error("컨테이너 이름 충돌");
  run(["start", container]);
} else {
  const url = new URL(config.DATABASE_URL);
  const dockerEnv = {
    ...process.env,
    POSTGRES_USER: "zmtrial",
    POSTGRES_PASSWORD: decodeURIComponent(url.password),
    POSTGRES_DB: "zmtrial",
  };
  const result = spawnSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "--label",
      "zm-os.trial=platform-rebuild",
      "-e",
      "POSTGRES_USER",
      "-e",
      "POSTGRES_PASSWORD",
      "-e",
      "POSTGRES_DB",
      "-p",
      "127.0.0.1:15438:5432",
      "postgres:17-alpine",
    ],
    { stdio: "inherit", env: dockerEnv, windowsHide: true },
  );
  if (result.status !== 0) throw new Error("시험 DB 시작 실패");
}
let ready = false;
for (let n = 0; n < 40; n++) {
  const check = spawnSync(
    "docker",
    ["exec", container, "pg_isready", "-U", "zmtrial", "-d", "zmtrial"],
    { stdio: "ignore", windowsHide: true },
  );
  if (check.status === 0) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) throw new Error("시험 DB 준비 시간 초과");
if (command === "setup") {
  console.info("시험 DB와 비공개 로컬 설정 준비 완료");
  process.exit(0);
}
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];
for (const name of ["@zm/api", "@zm/worker", "@zm/platform-web"]) {
  const child = spawn(
    pnpm,
    ["--filter", name, name === "@zm/platform-web" ? "dev" : "start"],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...config },
      shell: process.platform === "win32",
      windowsHide: true,
    },
  );
  children.push(child);
}
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid)
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill("SIGTERM");
  }
  process.exit(0);
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
for (const child of children)
  child.once("exit", (code) => {
    if (code && !closing) {
      console.error("시험 프로세스가 종료되었습니다.");
      close();
    }
  });
console.info(
  "웹 http://localhost:4300 · 종료 Ctrl+C · DB 중지는 node scripts/platform-trial.mjs stop",
);

import { resolve } from "node:path";
export interface Config {
  databaseUrl: string;
  files: string;
  port: number;
  assetPort: number;
  webOrigin: string;
  assetOrigin: string;
  testAuth: boolean;
  sessionSeconds: number;
  codeSeconds: number;
  statusSeconds: number;
  assetSecret: string;
}
export function config(): Config {
  // No production deployment defaults: this entry point is explicitly a local trial.
  if (process.env.ZM_MODE !== "local-test")
    throw new Error(
      "ZM_MODE=local-test가 필요합니다. 운영 배포 진입점이 아닙니다.",
    );
  if (
    !process.env.DATABASE_URL ||
    !process.env.ZM_ASSET_SECRET ||
    process.env.ZM_ASSET_SECRET.length < 32
  )
    throw new Error("DATABASE_URL 및 32자 이상 ZM_ASSET_SECRET이 필요합니다.");
  return {
    databaseUrl: process.env.DATABASE_URL,
    files: resolve(process.env.ZM_FILES ?? ".trial-files"),
    port: Number(process.env.PORT ?? 4310),
    assetPort: Number(process.env.ASSET_PORT ?? 4311),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:4300",
    assetOrigin: process.env.ASSET_ORIGIN ?? "http://localhost:4311",
    testAuth: process.env.ZM_TEST_AUTH === "1",
    sessionSeconds: 3600,
    codeSeconds: 60,
    statusSeconds: 86400,
    assetSecret: process.env.ZM_ASSET_SECRET,
  };
}
